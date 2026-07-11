import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineXMark, HiOutlineDocumentArrowUp, HiOutlineArrowPath, HiOutlineExclamationTriangle } from 'react-icons/hi2';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { sellerApi } from '../services/sellerApi';
import Modal from '@shared/components/ui/Modal';
import Button from '@shared/components/ui/Button';

const BulkUploadModal = ({ isOpen, onClose, onUploadSuccess, categories }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errors, setErrors] = useState([]);
  const fileInputRef = useRef(null);

  const resetState = () => {
    setFile(null);
    setUploadProgress(0);
    setErrors([]);
    setIsUploading(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Description', 'Brand', 'Price', 'Sale Price', 'Stock', 'Main Group', 'Category', 'Subcategory', 'Weight', 'Status', 'Main Image URL', 'Gallery Image URLs (comma separated)'],
      ['Premium Rice', 'High quality basmati rice', 'BestBrand', 500, 450, 100, 'Groceries', 'Food Staples', 'Rice', '1kg', 'active', 'https://example.com/image.jpg', '']
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.writeFile(wb, 'zozi9_bulk_product_template.xlsx');
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    
    if (selected.name.endsWith('.xlsx') || selected.name.endsWith('.csv')) {
      setFile(selected);
      setErrors([]);
    } else {
      toast.error('Please upload a valid .xlsx or .csv file');
      e.target.value = '';
    }
  };

  const findCategoryIdByName = (name, list) => {
    if (!name) return null;
    const lowerName = String(name).trim().toLowerCase();
    const found = list.find(item => String(item.name).trim().toLowerCase() === lowerName);
    return found ? (found._id || found.id) : null;
  };

  const processUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(10);
    setErrors([]);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      setUploadProgress(30);

      if (!json || json.length === 0) {
        throw new Error('The uploaded file is empty or invalid.');
      }

      const productsToCreate = [];
      const validationErrors = [];

      json.forEach((row, index) => {
        const rowNum = index + 2; // +1 for 0-index, +1 for header row
        
        const name = String(row['Name'] || '').trim();
        const price = Number(row['Price']);
        const stock = Number(row['Stock']);
        const headerName = String(row['Main Group'] || '').trim();
        const categoryName = String(row['Category'] || '').trim();
        const subcategoryName = String(row['Subcategory'] || '').trim();

        if (!name) {
          validationErrors.push(`Row ${rowNum}: Name is required`);
          return;
        }
        if (isNaN(price) || price < 0) {
          validationErrors.push(`Row ${rowNum}: Valid Price is required`);
          return;
        }
        if (isNaN(stock) || stock < 0) {
          validationErrors.push(`Row ${rowNum}: Valid Stock is required`);
          return;
        }

        // Category mapping
        const headerId = findCategoryIdByName(headerName, categories);
        if (!headerId) {
          validationErrors.push(`Row ${rowNum}: Main Group '${headerName}' not found`);
          return;
        }

        const headerNode = categories.find(h => (h._id || h.id) === headerId);
        const categoryId = findCategoryIdByName(categoryName, headerNode?.children || []);
        if (!categoryId) {
          validationErrors.push(`Row ${rowNum}: Category '${categoryName}' not found under '${headerName}'`);
          return;
        }

        const categoryNode = headerNode.children.find(c => (c._id || c.id) === categoryId);
        const subcategoryId = findCategoryIdByName(subcategoryName, categoryNode?.children || []);
        if (!subcategoryId) {
          validationErrors.push(`Row ${rowNum}: Subcategory '${subcategoryName}' not found under '${categoryName}'`);
          return;
        }

        const salePrice = Number(row['Sale Price']) || 0;
        const status = String(row['Status'] || 'active').toLowerCase();

        productsToCreate.push({
          name,
          description: row['Description'] || '',
          brand: row['Brand'] || '',
          price,
          salePrice,
          stock,
          headerId,
          categoryId,
          subcategoryId,
          weight: row['Weight'] || '',
          status: status === 'inactive' ? 'inactive' : 'active',
          mainImageUrl: row['Main Image URL'] || '',
          galleryImages: row['Gallery Image URLs (comma separated)'] ? String(row['Gallery Image URLs (comma separated)']).split(',').map(u => u.trim()) : [],
          variants: [{
            name: row['Weight'] || 'Default',
            price,
            salePrice,
            stock
          }]
        });
      });

      setUploadProgress(60);

      if (validationErrors.length > 0) {
        setErrors(validationErrors);
        setIsUploading(false);
        return;
      }

      if (productsToCreate.length === 0) {
        throw new Error('No valid products found to upload.');
      }

      // API Call to bulk create
      setUploadProgress(80);
      const res = await sellerApi.bulkCreateProducts({ products: productsToCreate });
      
      setUploadProgress(100);
      toast.success(res.data?.message || `Successfully imported ${productsToCreate.length} products!`);
      
      setTimeout(() => {
        handleClose();
        if (onUploadSuccess) onUploadSuccess();
      }, 1000);

    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || err.message || 'Failed to process file');
      setIsUploading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-xl w-full p-0 overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50/50">
        <h2 className="text-lg font-bold text-slate-800">Bulk Upload Products</h2>
        <button onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors">
          <HiOutlineXMark className="h-5 w-5" />
        </button>
      </div>

      <div className="p-6 space-y-6 bg-white">
        
        <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 flex gap-3 items-start">
          <HiOutlineDocumentArrowUp className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-brand-900 mb-1">How it works</h3>
            <p className="text-xs text-brand-700 leading-relaxed mb-2">
              Download the template, fill in your product details, and upload it back here. Ensure category names exactly match those in the system. Images should be provided as public URLs.
            </p>
            <button 
              onClick={downloadTemplate}
              className="text-xs font-bold text-brand-600 hover:text-brand-800 underline underline-offset-2"
            >
              Download Sample Template
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">Upload File (.xlsx or .csv)</label>
          <div 
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              file ? 'border-primary/50 bg-primary/5' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-primary/30'
            } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              accept=".xlsx, .csv" 
              onChange={handleFileChange}
            />
            {file ? (
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                {!isUploading && (
                  <p className="text-[10px] text-primary font-bold mt-2 hover:underline">Click to change file</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <HiOutlineDocumentArrowUp className="h-8 w-8 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-700">Click to browse or drag file here</p>
                <p className="text-xs text-slate-500">Supports .xlsx and .csv files</p>
              </div>
            )}
          </div>
        </div>

        {errors.length > 0 && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 max-h-40 overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm mb-2">
              <HiOutlineExclamationTriangle className="h-5 w-5" />
              <span>Validation Errors ({errors.length})</span>
            </div>
            <ul className="list-disc list-inside text-xs text-rose-600 space-y-1">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {isUploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-600">
              <span>Processing...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
        <Button variant="outline" onClick={handleClose} disabled={isUploading}>
          Cancel
        </Button>
        <Button 
          onClick={processUpload} 
          disabled={!file || isUploading}
          className="min-w-[120px]"
        >
          {isUploading ? (
            <>
              <HiOutlineArrowPath className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            'Upload Products'
          )}
        </Button>
      </div>
    </Modal>
  );
};

export default BulkUploadModal;
