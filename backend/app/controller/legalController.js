import LegalPage from '../models/legalPage.js';

const ROLES = ['CUSTOMER', 'SELLER', 'DELIVERY'];
const TYPES = ['TERMS', 'PRIVACY'];
const MAX_CONTENT_CHARS = 200000;

function parseParams(params) {
    const role = String(params.role || '').toUpperCase();
    const type = String(params.type || '').toUpperCase();
    if (!ROLES.includes(role) || !TYPES.includes(type)) return null;
    return { role, type };
}

/**
 * Only admins can write these pages, so this is defence in depth rather than a full
 * sanitizer: it drops active content that formatted text never needs.
 */
function stripActiveContent(html) {
    return String(html)
        .replace(/<(script|style|iframe|object|embed|form)\b[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<(script|style|iframe|object|embed|form|input|button|link|meta)\b[^>]*>/gi, '')
        .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '$1="#"');
}

export const getLegalPage = async (req, res) => {
    try {
        const parsed = parseParams(req.params);
        if (!parsed) {
            return res.status(400).json({ success: false, message: 'Unknown legal page' });
        }
        const page = await LegalPage.findOne(parsed).lean();

        return res.status(200).json({
            success: true,
            result: page || { ...parsed, content: '', updatedAt: null }
        });
    } catch (error) {
        console.error('Error fetching legal page:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

export const updateLegalPage = async (req, res) => {
    try {
        const parsed = parseParams(req.params);
        if (!parsed) {
            return res.status(400).json({ success: false, message: 'Unknown legal page' });
        }
        const { content } = req.body || {};
        if (typeof content !== 'string') {
            return res.status(400).json({ success: false, message: 'Content is required' });
        }
        if (content.length > MAX_CONTENT_CHARS) {
            return res.status(400).json({ success: false, message: 'Content is too long' });
        }

        const page = await LegalPage.findOneAndUpdate(
            parsed,
            { $set: { content: stripActiveContent(content) } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).lean();

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
