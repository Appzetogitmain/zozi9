import mongoose from 'mongoose';

const legalPageSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            required: true,
            enum: ['TERMS', 'PRIVACY'],
        },
        role: {
            type: String,
            required: true,
            enum: ['CUSTOMER', 'SELLER', 'DELIVERY'],
        },
        content: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

// Ensure there is only one page of a specific type per role
legalPageSchema.index({ type: 1, role: 1 }, { unique: true });

export default mongoose.model('LegalPage', legalPageSchema);
