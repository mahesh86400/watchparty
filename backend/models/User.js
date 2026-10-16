import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 40,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    // select:false means queries do NOT return the password unless we ask for it
    password: {
      type: String,
      required: true,
      select: false,
    },
  },
  { timestamps: true }
)

export default mongoose.model('User', userSchema)