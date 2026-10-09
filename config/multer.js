const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Pastikan folder uploads tersedia
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Storage untuk suara bel
const suaraBelStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = path.join(__dirname, '../public/uploads/suara');
    ensureDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `bel-${uniqueSuffix}${ext}`);
  },
});

// Filter file audio
const audioFilter = (_req, file, cb) => {
  const allowedExt = ['.mp3', '.ogg', '.wav', '.aac', '.flac', '.m4a'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExt.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung. Gunakan MP3, WAV, OGG, atau AAC.'));
  }
};

const uploadSuaraBel = multer({
  storage: suaraBelStorage,
  fileFilter: audioFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // Max 20MB
});

// Storage untuk foto profil/siswa
const fotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = path.join(__dirname, '../public/uploads/foto');
    ensureDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `foto-${uniqueSuffix}${ext}`);
  },
});

const imageFilter = (_req, file, cb) => {
  const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExt.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Format gambar tidak didukung. Gunakan JPG, PNG, atau GIF.'));
  }
};

const uploadFoto = multer({
  storage: fotoStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB
});

const uploadDocumentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/temp');
    ensureDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  },
});

const docFilter = (_req, file, cb) => {
  const allowedExt = ['.csv', '.xlsx', '.xls'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExt.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung. Gunakan CSV atau Excel (.xlsx/.xls).'));
  }
};

const uploadDocument = multer({
  storage: uploadDocumentStorage,
  fileFilter: docFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB
});

uploadDocument.uploadSuaraBel = uploadSuaraBel;
uploadDocument.uploadFoto = uploadFoto;
uploadDocument.uploadDocument = uploadDocument;

module.exports = uploadDocument;
