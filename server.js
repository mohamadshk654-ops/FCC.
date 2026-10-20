const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// قاعدة بيانات مؤقتة على الخادم (يمكنك ربطها لاحقاً بـ MongoDB أو Supabase)
let database = {
    users: {},          // تخزين بيانات المستخدمين حسب البريد الإلكتروني
    pendingDeposits: [], // طلبات الإيداع المعلقة
    pendingWithdrawals: [], // طلبات السحب المعلقة
    pendingKYCs: []     // طلبات التوثيق المعلقة
};

// 1. تسجيل مستخدم جديد مع كود الدعوة والإحالة
app.post('/api/register', (req, res) => {
    const { name, email, password, refCode } = req.body;
    
    if (database.users[email]) {
        return res.status(400).json({ success: false, message: 'البريد الإلكتروني مسجل مسبقاً!' });
    }

    // توليد كود دعوة خاص بالمستخدم الجديد
    const myRefCode = 'FCC-' + Math.floor(1000 + Math.random() * 9000);

    database.users[email] = {
        name,
        email,
        password,
        balance: 0.00,
        earnings: 0.00,
        activeInvestments: [],
        lastTaskTime: null,
        kycStatus: 'unverified',
        refCode: myRefCode,
        referredBy: refCode || null,
        teamCount: 0,
        teamEarnings: 0.00
    };

    // إذا كان مسجلاً عبر كود إحالة لصديق، قم بزيادة عداد الفريق للصديق
    if (refCode) {
        for (let uEmail in database.users) {
            if (database.users[uEmail].refCode === refCode) {
                database.users[uEmail].teamCount += 1;
                break;
            }
        }
    }

    res.json({ success: true, user: database.users[email] });
});

// 2. تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = database.users[email];

    if (!user || user.password !== password) {
        return res.status(400).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة!' });
    }

    res.json({ success: true, user });
});

// 3. جلب بيانات المستخدم الحالية
app.get('/api/user/:email', (req, res) => {
    const user = database.users[req.params.email];
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    res.json({ success: true, user });
});

// 4. إرسال طلب إيداع
app.post('/api/deposit', (req, res) => {
    const { email, amount, method } = req.body;
    const user = database.users[email];
    if (!user) return res.status(404).json({ success: false });

    const depositReq = {
        id: Date.now(),
        userEmail: email,
        userName: user.name,
        amount,
        method
    };

    database.pendingDeposits.push(depositReq);
    res.json({ success: true, message: 'تم إرسال طلب الإيداع للشركة بنجاح' });
});

// 5. إرسال طلب سحب
app.post('/api/withdraw', (req, res) => {
    const { email, amount, method, address } = req.body;
    const user = database.users[email];
    if (!user) return res.status(404).json({ success: false });

    if (amount > user.balance) {
        return res.status(400).json({ success: false, message: 'الرصيد غير كافٍ' });
    }

    const withdrawReq = {
        id: Date.now(),
        userEmail: email,
        userName: user.name,
        amount,
        method,
        address
    };

    database.pendingWithdrawals.push(withdrawReq);
    res.json({ success: true, message: 'تم إرسال طلب السحب للشركة بنجاح' });
});

// 6. إرسال طلب توثيق الهوية KYC
app.post('/api/kyc', (req, res) => {
    const { email, fullName, country, docType, frontImg, backImg } = req.body;
    const user = database.users[email];
    if (!user) return res.status(404).json({ success: false });

    user.kycStatus = 'pending';

    database.pendingKYCs.push({
        id: Date.now(),
        userEmail: email,
        fullName,
        country,
        docType,
        frontImg,
        backImg
    });

    res.json({ success: true, message: 'تم إرسال مستندات التوثيق بنجاح' });
});

// 7. جلب الطلبات المعلقة للأدمن
app.get('/api/admin/data', (req, res) => {
    res.json({
        success: true,
        deposits: database.pendingDeposits,
        withdrawals: database.pendingWithdrawals,
        kycs: database.pendingKYCs
    });
});

// 8. موافقة أو رفض الأدمن على الطلبات
app.post('/api/admin/action', (req, res) => {
    const { type, id, action } = req.body; // type: 'deposit', 'withdraw', 'kyc' | action: 'approve', 'reject'

    if (type === 'deposit') {
        const index = database.pendingDeposits.findIndex(d => d.id === id);
        if (index !== -1) {
            const reqData = database.pendingDeposits[index];
            if (action === 'approve') {
                database.users[reqData.userEmail].balance += reqData.amount;
                
                // عمولة الفريق 3% لمن دعا هذا المستخدم
                const referrerEmail = database.users[reqData.userEmail].referredBy;
                if (referrerEmail && database.users[referrerEmail]) {
                    const commission = reqData.amount * 0.03;
                    database.users[referrerEmail].balance += commission;
                    database.users[referrerEmail].teamEarnings += commission;
                }
            }
            database.pendingDeposits.splice(index, 1);
        }
    } else if (type === 'withdraw') {
        const index = database.pendingWithdrawals.findIndex(w => w.id === id);
        if (index !== -1) {
            const reqData = database.pendingWithdrawals[index];
            if (action === 'approve') {
                database.users[reqData.userEmail].balance -= reqData.amount;
            }
            database.pendingWithdrawals.splice(index, 1);
        }
    } else if (type === 'kyc') {
        const index = database.pendingKYCs.findIndex(k => k.id === id);
        if (index !== -1) {
            const reqData = database.pendingKYCs[index];
            if (action === 'approve') {
                database.users[reqData.userEmail].kycStatus = 'verified';
            } else {
                database.users[reqData.userEmail].kycStatus = 'unverified';
            }
            database.pendingKYCs.splice(index, 1);
        }
    }

    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
