const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, index: true }, // e.g., 'DNCC-W12' or 'W-01'
    name: { type: String },
    type: { type: String, enum: ['UP', 'Pourashava', 'CityCorp', 'Other'], default: 'Other' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Organization', OrganizationSchema);
