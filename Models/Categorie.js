const mongoose = require('mongoose');

const categorieSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a category name'],
      trim: true,
    },
    icon: {
      type: String,
      default: 'Grid',
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Categorie',
      default: null,
    },
    description: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Categorie', categorieSchema);
