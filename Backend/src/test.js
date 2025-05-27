const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const cors = require("cors");
require('dotenv').config();
const { ApifyClient } = require('apify-client');
// YouTube.js setup with CommonJS
async function getYouTubeInstance() {
    const { Innertube } = await import('youtubei.js/web');
    return Innertube.create({
        lang: 'en',
        location: 'US',
        retrieve_player: false,
        fetch_options: {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
            }
        }
    });
}
app.get("/Health", (req, res) => {
  res.json({
    msg: "Everything Works fine till now from yt "
  });
});
const UserModel = require("../models/UsersSchema");
const MONGOOSE_URL = process.env.MONGO_URL;
const KEY1 = process.env.KEY2;
mongoose
  .connect(MONGOOSE_URL)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("Something went wrong", err));

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

app.post("/Login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await UserModel.findOne({ username });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({
        success: false,
        message: "Invalid password",
      });
    }

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
});
app.post("/Signup", async (req, res) => {
  try {
    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const User = new UserModel({ username, email, password: hashedPassword });
    await User.save();

    res.status(200).json({
      msg: "Signup ready",
      username,
      email,
      objectid: User._id,
    });
  } catch (err) {
    res.status(500).json({
      Msg: "Something went wrong",
      error: err,
    });
  }
});
app.use(express.json());
app.use(cors()); 
// app.post("/Summary", async (req, res) => {
//     try {
//         console.log("Incoming request:", req.body);

//         const { videoId } = req.body;

//         // Validate video ID
//         if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
//             return res.status(400).json({ 
//                 success: false,
//                 error: "Invalid YouTube Video ID format" 
//             });
//         }

//         // Get YouTube instance
//         const youtube = await getYouTubeInstance();
        
//         // First check basic availability
//         const basicInfo = await youtube.getBasicInfo(videoId);
//         if (basicInfo.playability_status.status !== 'OK') {
//             return res.status(400).json({
//                 success: false,
//                 error: "Video unavailable",
//                 reason: basicInfo.playability_status.reason || 'Not available in your region/country'
//             });
//         }

//         // Get full video info
//         const info = await youtube.getInfo(videoId);
        
//         // Check transcript availability
//         if (!info.has_transcript) {
//             return res.status(400).json({
//                 success: false,
//                 error: "Transcript disabled",
//                 message: "This video does not have captions available"
//             });
//         }

//         // Fetch transcript
//         const transcriptData = await info.getTranscript();
//         const transcriptText = transcriptData.transcript.content.body.initial_segments
//             .map(segment => segment.snippet.text)
//             .join(" ");
//  console.log("summary generated")

//         // Generate summary
//         const genAI = new GoogleGenerativeAI(process.env.KEY1);
//         const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        
//         const prompt = `Generate a concise 200-word summary of this video transcript:\n\n${transcriptText}`;
//         const result = await model.generateContent(prompt);
//         const summary = await result.response.text();
       
//         res.status(200).json({
//             success: true,
//             summary: summary.trim(),
//             videoDetails: {
//                 title: basicInfo.basic_info.title,
//                 duration: basicInfo.basic_info.duration,
//                 channel: basicInfo.basic_info.author
//             }
//         });


//     } catch (error) {
//         console.error("Summary Error:", error);
        
//         const errorInfo = {
//             success: false,
//             error: "Failed to generate summary",
//             message: error.message,
//             type: "PROCESSING_ERROR"
//         };

//         if (error.info?.playability_status) {
//             errorInfo.type = "VIDEO_UNAVAILABLE";
//             errorInfo.message = error.info.playability_status.reason;
//         }

//         if (error.message.includes("Transcript disabled")) {
//             errorInfo.type = "TRANSCRIPT_DISABLED";
//             errorInfo.message = "Captions are disabled for this video";
//         }

//         const statusCode = errorInfo.type === "VIDEO_UNAVAILABLE" ? 400 : 500;
//         res.status(statusCode).json(errorInfo);
//     }
// });
app.post("/Summary", async (req, res) => {
    try {
        const { videoId } = req.body;

        if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
            return res.status(400).json({ success: false, error: "Invalid YouTube Video ID format" });
        }

        const input = {
            video_url: `https://www.youtube.com/watch?v=${videoId}`,
            language: "",
        };

        const run = await client.actor("invideoiq/video-transcript-scraper").call(input);
    //  const run = await client.task("KZijQY3uXaMvf4OnK").call();
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        const transcriptText = items.map((item) => item.text).join(" ");

        if (!transcriptText || transcriptText.length < 20) {
            return res.status(400).json({
                success: false,
                error: "Transcript not available or too short.",
            });
        }

        const genAI = new GoogleGenerativeAI(process.env.KEY1);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `Generate a concise 200-word summary of this video transcript:\n\n${transcriptText}`;
        const result = await model.generateContent(prompt);
        const summary = await result.response.text();

        res.status(200).json({
            success: true,
            summary: summary.trim(),
        });

    } catch (error) {
        console.error("Summary Error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to generate summary",
            message: error.message,
        });
    }
});


const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});