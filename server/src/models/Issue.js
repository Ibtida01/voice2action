const mongoose = require('mongoose');

const IssueSchema = new mongoose.Schema(
  {
    trackingId: { type: String, unique: true, index: true },

    title: { type: String, required: true },
    description: { type: String, required: true },

    category: { type: String, default: 'General' },
    locationText: { type: String },
    lat: { type: Number },
    lng: { type: Number },

    //Ward & Organization code (for per-LGI metrics)
    wardCode: { type: String, index: true },
    orgCode: { type: String, index: true }, // e.g., 'DNCC-W12' or you can just reuse wardCode

    images: { type: [String], default: [] },

    status: {
      type: String,
      enum: ['RECEIVED', 'UNDER_REVIEW', 'IN_PROCESS', 'RESOLVED'],
      default: 'RECEIVED'
    },
    adminNotes: { type: String },
    upvotes: { type: Number, default: 0 },
    citizenContact: { type: String },
    firstResponseAt: { type: Date },
    resolvedAt: { type: Date },

    //sentiment score (negative = more urgent/negative tone)
    sentimentScore: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Issue', IssueSchema);
