import LegalPage from '../models/legalPage.js';

export const getLegalPage = async (req, res) => {
    try {
        const { role, type } = req.params;
        const page = await LegalPage.findOne({ 
            role: role.toUpperCase(), 
            type: type.toUpperCase() 
        });
        
        return res.status(200).json({
            success: true,
            result: page || { role: role.toUpperCase(), type: type.toUpperCase(), content: '' }
        });
    } catch (error) {
        console.error('Error fetching legal page:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

export const updateLegalPage = async (req, res) => {
    try {
        const { role, type } = req.params;
        const { content } = req.body;

        const roleUpper = role.toUpperCase();
        const typeUpper = type.toUpperCase();

        let page = await LegalPage.findOne({ role: roleUpper, type: typeUpper });
        
        if (page) {
            page.content = content;
            await page.save();
        } else {
            page = await LegalPage.create({
                role: roleUpper,
                type: typeUpper,
                content
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Page updated successfully',
            result: page
        });
    } catch (error) {
        console.error('Error updating legal page:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
