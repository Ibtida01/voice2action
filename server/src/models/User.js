const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, index: true },
  passwordHash: String,
  role: { type: String, enum: ['admin', 'officer'], default: 'officer' }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
