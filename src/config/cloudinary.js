const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isCV = file.fieldname === 'cv';
    return {
      folder: isCV ? 'horaextra/cvs' : 'horaextra/documentos',
      allowed_formats: isCV ? ['pdf', 'doc', 'docx'] : ['jpg', 'jpeg', 'png'],
      resource_type: isCV ? 'raw' : 'image',
    };
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'id_document') {
      const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
      return allowed.includes(file.mimetype)
        ? cb(null, true)
        : cb(new Error('Apenas JPG/PNG para documento'));
    }
    if (file.fieldname === 'cv') {
      const allowed = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      return allowed.includes(file.mimetype)
        ? cb(null, true)
        : cb(new Error('Apenas PDF/DOC para currículo'));
    }
    cb(new Error('Campo não reconhecido: ' + file.fieldname));
  },
});

module.exports = { upload, cloudinary };
