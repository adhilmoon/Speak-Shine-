import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    quote: String,
    question: String,
  },
  { timestamps: true },
);

export default mongoose.model("Question", questionSchema);
