const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, '')));
app.use(express.json());

// Database Connection
const mongoUrl = process.env.MONGO_URL || "mongodb://mongo:27017/polling";

mongoose.connect(mongoUrl)
  .then(() => console.log("Connected to MongoDB: Polling service ready!"))
  .catch(err => console.error("MongoDB Connection Failed:", err));


// --- MongoDB Models ---
const VoteSchema = new mongoose.Schema({ 
    option: String, 
    count: { type: Number, default: 0 } 
});
const Vote = mongoose.model('Vote', VoteSchema);

const VoterSchema = new mongoose.Schema({
    ipAddress: { type: String, required: true, unique: true },
    votedAt: { type: Date, default: Date.now }
});
const Voter = mongoose.model('Voter', VoterSchema);


// Initialize options
async function initializeVotes() {
    await Vote.findOneAndUpdate({ option: 'Option A' }, {}, { upsert: true, setDefaultsOnInsert: true });
    await Vote.findOneAndUpdate({ option: 'Option B' }, {}, { upsert: true, setDefaultsOnInsert: true });
}
initializeVotes();


// --- API Endpoints ---

// 1. API to Record a Vote
app.post('/api/vote', async (req, res) => {
    const { option } = req.body;

    // --- STEP 1: GET THE USER'S IP ADDRESS (ROBUST VERSION) ---
    let userIp = req.header('X-Real-IP') || req.connection.remoteAddress;

    // Further check X-Forwarded-For chain for the original client IP
    if (req.header('x-forwarded-for')) {
        // The first IP in the chain is typically the true client IP
        const ips = req.header('x-forwarded-for').split(',').map(ip => ip.trim());
        userIp = ips[0];
    }
    
    // --- STEP 2: CHECK IF IP HAS VOTED ---
    const existingVoter = await Voter.findOne({ ipAddress: userIp });

    if (existingVoter) {
        console.log(`Vote rejected for IP: ${userIp} (Already Voted)`);
        return res.status(403).send({ message: 'Error: You have already voted. Only one vote per user is allowed.' });
    }

    if (option !== 'Option A' && option !== 'Option B') {
        return res.status(400).send({ message: 'Invalid option' });
    }
    
    // --- STEP 3: RECORD THE VOTE AND SAVE THE IP ---
    try {
        await Vote.findOneAndUpdate({ option: option }, { $inc: { count: 1 } });
        await Voter.create({ ipAddress: userIp });

        console.log(`Vote recorded for IP: ${userIp}`);
        res.status(200).send({ status: 'ok', message: 'Vote successfully recorded!' });
    } catch (error) {
        console.error("Database error during voting:", error);
        res.status(500).send({ message: 'Server error during voting process.' });
    }
});

// 2. API to Get Results
app.get('/api/results', async (req, res) => {
    const votes = await Vote.find({});
    
    const results = {};
    votes.forEach(vote => {
        results[vote.option] = vote.count;
    });

    res.json(results);
});


// Serve the index.html file on the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(3000, () => {
    console.log("Server listening on port 3000");
});
