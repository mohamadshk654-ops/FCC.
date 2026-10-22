const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' })); // رفع الحد لاستيعاب صور الهوية
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname)));

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://mohamadshk654_db_user:qNpyJyoVW7R2dtNU@cluster0.ositygo.mongodb.net/fcc_db";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB Atlas successfully!"))
    .catch(err => console.error("❌ MongoDB connection error:", err));

const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    balance: { type: Number, default: 0.00 },
    earnings: { type: Number, default: 0.00 },
    activeInvestments: { type: Array, default: [] },
    lastTaskTime: { type: Number, default: null },
    kycStatus: { type: String, default: 'unverified' },
    refCode: String,
    referredBy: { type: String, default: null },
    teamCount: { type: Number, default: 0 },
    teamEarnings: { type: Number, default: 0.00 }
});
const User = mongoose.model('User', userSchema);

const depositSchema = new mongoose.Schema({ id: Number, userEmail: String, userName: String, amount: Number, method: String });
const Deposit = mongoose.model('Deposit', depositSchema);

const withdrawSchema = new mongoose.Schema({ id: Number, userEmail: String, userName: String, amount: Number, method: String, address: String });
const Withdraw = mongoose.model('Withdraw', withdrawSchema);

const kycSchema = new mongoose.Schema({ id: Number, userEmail: String, fullName: String, country: String, docType: String, frontImg: String, backImg: String });
const KYC = mongoose.model('KYC', kycSchema);

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, refCode } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, message: 'البريد الإلكتروني مسجل مسبقاً!' });

        const myRefCode = 'FCC-' + Math.floor(1000 + Math.random() * 9000);
        const newUser = new User({ name, email, password, refCode: myRefCode, referredBy: refCode || null });
        await newUser.save();

        if (refCode) {
            await User.updateOne({ refCode: refCode }, { $inc: { teamCount: 1 } });
        }

        res.json({ success: true, user: newUser });
    } catch (err) {
        res.status(500).json({ success: false, message: 'خطأ في الخادم' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || user.password !== password) {
            return res.status(400).json({ success: false, message: 'البريد أو كلمة المرور غير صحيحة!' });
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/user/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        if (!user) return res.status(404).json({ success: false });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/invest', async (req, res) => {
    try {
        const { email, planName, price, dailyProfit, duration } = req.body;
        const user = await User.findOne({ email });
        const parsedPrice = parseFloat(price);

        if (!user || isNaN(parsedPrice) || parsedPrice <= 0 || user.balance < parsedPrice) {
            return res.status(400).json({ success: false, message: 'رصيد غير كافٍ أو مبلغ غير صالح' });
        }

        user.balance -= parsedPrice;
        const investment = {
            id: Date.now(),
            planName,
            price: parsedPrice,
            dailyProfit,
            duration,
            date: new Date()
        };
        user.activeInvestments.push(investment);
        await user.save();

        res.json({ success: true, message: 'تم تفعيل الباقة بنجاح', user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'خطأ في الخادم' });
    }
});

app.post('/api/task', async (req, res) => {
    try {
        const { email, reward } = req.body;
        const user = await User.findOne({ email });
        const parsedReward = parseFloat(reward);

        if (!user || isNaN(parsedReward) || parsedReward <= 0) {
            return res.status(400).json({ success: false, message: 'بيانات غير صالحة' });
        }

        user.balance += parsedReward;
        user.earnings += parsedReward;
        user.lastTaskTime = Date.now();
        await user.save();

        res.json({ success: true, message: 'تم إضافة الأرباح بنجاح', user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'خطأ في الخادم' });
    }
});

app.post('/api/deposit', async (req, res) => {
    try {
        const { email, amount, method } = req.body;
        const parsedAmount = parseFloat(amount);
        const user = await User.findOne({ email });
        if (!user || isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ success: false, message: 'مبلغ غير صالح' });

        const depositReq = new Deposit({ id: Date.now(), userEmail: email, userName: user.name, amount: parsedAmount, method });
        await depositReq.save();
        res.json({ success: true, message: 'تم إرسال طلب الإيداع' });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { email, amount, method, address } = req.body;
        const parsedAmount = parseFloat(amount);
        const user = await User.findOne({ email });
        
        if (!user || isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > user.balance) {
            return res.status(400).json({ success: false, message: 'رصيد غير كافٍ أو مبلغ غير صالح' });
        }

        const withdrawReq = new Withdraw({ id: Date.now(), userEmail: email, userName: user.name, amount: parsedAmount, method, address });
        await withdrawReq.save();
        res.json({ success: true, message: 'تم إرسال طلب السحب' });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/kyc', async (req, res) => {
    try {
        const { email, fullName, country, docType, frontImg, backImg } = req.body;
        await User.updateOne({ email }, { kycStatus: 'pending' });
        const kycReq = new KYC({ id: Date.now(), userEmail: email, fullName, country, docType, frontImg, backImg });
        await kycReq.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/admin/data', async (req, res) => {
    try {
        const deposits = await Deposit.find();
        const withdrawals = await Withdraw.find();
        const kycs = await KYC.find();
        res.json({ success: true, deposits, withdrawals, kycs });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/admin/action', async (req, res) => {
    try {
        const { type, id, action } = req.body;
        if (type === 'deposit') {
            const reqData = await Deposit.findOne({ id });
            if (reqData && action === 'approve') {
                const targetUser = await User.findOne({ email: reqData.userEmail });
                if (targetUser) {
                    targetUser.balance += reqData.amount;
                    await targetUser.save();

                    if (targetUser.referredBy) {
                        const referrer = await User.findOne({ refCode: targetUser.referredBy });
                        if (referrer) {
                            const commission = reqData.amount * 0.03;
                            referrer.balance += commission;
                            referrer.teamEarnings += commission;
                            await referrer.save();
                        }
                    }
                }
            }
            await Deposit.deleteOne({ id });
        } else if (type === 'withdraw') {
            const reqData = await Withdraw.findOne({ id });
            if (reqData && action === 'approve') {
                await User.updateOne({ email: reqData.userEmail }, { $inc: { balance: -reqData.amount } });
            }
            await Withdraw.deleteOne({ id });
        } else if (type === 'kyc') {
            const reqData = await KYC.findOne({ id });
            if (reqData) {
                const newStatus = (action === 'approve') ? 'verified' : 'unverified';
                await User.updateOne({ email: reqData.userEmail }, { kycStatus: newStatus });
                await KYC.deleteOne({ id });
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
