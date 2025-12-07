import React, { useState, useEffect, useMemo } from 'react';
// Εισάγουμε και το setDoc για να ορίζουμε εμείς το ID του εγγράφου
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc } from 'firebase/firestore';

// --- ΡΥΘΜΙΣΕΙΣ FIREBASE ---
// Χρησιμοποιούμε τα πραγματικά κλειδιά (Hardcoded) για άμεση λειτουργία
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Αυτά τα αφήνετε ως έχουν
const appId = "timologia"; 
const initialAuthToken = null; 

// Utility for formatting currency
const formatCurrency = (amount) => {
    if (amount === null || amount === undefined || isNaN(amount)) return '€0.00';
    try {
        return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(amount);
    } catch (e) {
        console.warn("Currency formatting failed:", e);
        return `${amount} €`;
    }
};

// --- Helper για μετατροπή ArrayBuffer σε Base64 (για τη γραμματοσειρά) ---
const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
};

// --- NEW COMPONENT: Statistics Modal (Dark Mode) ---
const StatisticsModal = ({ invoices, onClose }) => {
    // State για Full Screen
    const [isFullScreen, setIsFullScreen] = useState(false);

    // Υπολογισμός Στατιστικών Προμηθευτών
    const stats = useMemo(() => {
        const supplierMap = {};
        let totalAmount = 0;

        invoices.forEach(inv => {
            const supplier = inv.supplier || 'Άγνωστος';
            const amount = parseFloat(inv.amount) || 0;
            
            if (!supplierMap[supplier]) {
                supplierMap[supplier] = { name: supplier, amount: 0, count: 0 };
            }
            supplierMap[supplier].amount += amount;
            supplierMap[supplier].count += 1;
            totalAmount += amount;
        });

        const data = Object.values(supplierMap).map(item => ({
            ...item,
            percentage: totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0
        }));

        return data.sort((a, b) => b.amount - a.amount);
    }, [invoices]);

    // Υπολογισμός Στατιστικών Ανά Μήνα
    const monthlyStats = useMemo(() => {
        const monthMap = {};
        let totalAmount = 0;

        invoices.forEach(inv => {
            let dateObj = null;
            if (inv.date) {
                dateObj = inv.date instanceof Date ? inv.date : new Date(inv.date);
            } else {
                return;
            }

            const sortKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
            const displayName = dateObj.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });
            
            const amount = parseFloat(inv.amount) || 0;

            if (!monthMap[sortKey]) {
                monthMap[sortKey] = { name: displayName, sortKey: sortKey, amount: 0, count: 0 };
            }
            monthMap[sortKey].amount += amount;
            monthMap[sortKey].count += 1;
            totalAmount += amount;
        });

        const data = Object.values(monthMap).map(item => ({
            ...item,
            percentage: totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0
        }));

        return data.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    }, [invoices]);

    const totalGrand = stats.reduce((sum, item) => sum + item.amount, 0);

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-300 ${isFullScreen ? 'bg-gray-900 p-0' : 'bg-black bg-opacity-80 p-4 backdrop-blur-sm'}`}>
            <div className={`bg-gray-800 shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${isFullScreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl max-h-[90vh] rounded-2xl animate-fade-in-up border border-gray-700'}`}>
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-900 to-indigo-900 p-5 text-white flex justify-between items-center shrink-0 shadow-md border-b border-gray-700">
                    <div className="flex items-center space-x-3">
                        <div className="bg-white bg-opacity-10 p-2 rounded-lg">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-100">Ανάλυση Εξόδων</h2>
                            <p className="text-xs text-gray-400 opacity-80">Πλήρης εικόνα προμηθευτών & μηνών</p>
                        </div>
                    </div>
                    <div className="flex space-x-2">
                        <button 
                            onClick={() => setIsFullScreen(!isFullScreen)} 
                            className="text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-full p-2 transition"
                            title={isFullScreen ? "Επαναφορά" : "Πλήρης Οθόνη"}
                        >
                            {isFullScreen ? (
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 9L4 4m0 0l5 0m-5 0l0 5M15 9l5-5m0 0l-5 0m5 0l0 5M9 15l-5 5m0 0l5 0m-5 0l0-5M15 15l5 5m0 0l-5 0m5 0l0-5" />
                                </svg>
                            ) : (
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                </svg>
                            )}
                        </button>
                        <button onClick={onClose} className="text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-full p-2 transition">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-grow bg-gray-900 space-y-8 custom-scrollbar-dark">
                    
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-sm flex items-center">
                            <div className="p-3 rounded-full bg-blue-900 text-blue-300 mr-4">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-400 font-semibold">Συνολικά Έξοδα</p>
                                <p className="text-xl font-bold text-gray-100">{formatCurrency(totalGrand)}</p>
                            </div>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-sm flex items-center">
                            <div className="p-3 rounded-full bg-indigo-900 text-indigo-300 mr-4">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-400 font-semibold">Προμηθευτές</p>
                                <p className="text-xl font-bold text-gray-100">{stats.length}</p>
                            </div>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-sm flex items-center">
                            <div className="p-3 rounded-full bg-purple-900 text-purple-300 mr-4">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-400 font-semibold">Μήνες με Κίνηση</p>
                                <p className="text-xl font-bold text-gray-100">{monthlyStats.length}</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Column 1: Suppliers Chart & Table */}
                        <div className="space-y-8">
                            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center border-b border-gray-700 pb-2">
                                    <span className="bg-blue-900 text-blue-200 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded">ΓΡΑΦΗΜΑ</span>
                                    Κατανομή ανά Προμηθευτή
                                </h3>
                                <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar-dark">
                                    {stats.map((item, index) => (
                                        <div key={index} className="flex items-center text-sm group">
                                            <div className="w-24 md:w-32 truncate font-medium text-gray-300 mr-3 text-right" title={item.name}>{item.name}</div>
                                            <div className="flex-1 h-6 bg-gray-700 rounded-lg overflow-hidden relative">
                                                <div
                                                    className="h-full rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-all duration-700 ease-out flex items-center justify-end pr-2 text-white text-xs font-bold"
                                                    style={{ width: `${Math.max(item.percentage, 10)}%` }}
                                                >
                                                    {item.percentage.toFixed(1)}%
                                                </div>
                                            </div>
                                            <div className="w-20 text-right font-bold text-gray-200 ml-2 text-xs">
                                                {formatCurrency(item.amount)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-sm overflow-hidden">
                                <div className="bg-gray-750 p-4 border-b border-gray-700">
                                    <h3 className="text-lg font-bold text-gray-200 flex items-center">
                                        <span className="bg-green-900 text-green-200 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded">ΠΙΝΑΚΑΣ</span>
                                        Προμηθευτές
                                    </h3>
                                </div>
                                <div className="overflow-x-auto max-h-60 custom-scrollbar-dark">
                                    <table className="min-w-full divide-y divide-gray-700">
                                        <thead className="bg-gray-700 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-bold text-gray-300 uppercase">Επωνυμία</th>
                                                <th className="px-4 py-2 text-center text-xs font-bold text-gray-300 uppercase">Πληθος</th>
                                                <th className="px-4 py-2 text-right text-xs font-bold text-gray-300 uppercase">Ποσό</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                                            {stats.map((item, index) => (
                                                <tr key={index} className="hover:bg-gray-700">
                                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-200">{item.name}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-400">{item.count}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-bold text-indigo-400">{formatCurrency(item.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Column 2: Monthly Stats */}
                        <div className="space-y-8">
                            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center border-b border-gray-700 pb-2">
                                    <span className="bg-orange-900 text-orange-200 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded">ΧΡΟΝΟΣ</span>
                                    Εξέλιξη ανά Μήνα
                                </h3>
                                <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar-dark">
                                    {monthlyStats.map((item, index) => (
                                        <div key={index} className="flex items-center text-sm group">
                                            <div className="w-24 md:w-32 truncate font-medium text-gray-300 mr-3 text-right capitalize" title={item.name}>{item.name.replace(/\s\d{4}$/, '')}</div>
                                            <div className="flex-1 h-6 bg-gray-700 rounded-lg overflow-hidden relative">
                                                <div
                                                    className="h-full rounded-lg bg-orange-600 hover:bg-orange-500 transition-all duration-700 ease-out flex items-center justify-end pr-2 text-white text-xs font-bold"
                                                    style={{ width: `${Math.max(item.percentage, 10)}%` }}
                                                >
                                                    {item.percentage.toFixed(1)}%
                                                </div>
                                            </div>
                                            <div className="w-20 text-right font-bold text-gray-200 ml-2 text-xs">
                                                {formatCurrency(item.amount)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-sm overflow-hidden">
                                <div className="bg-gray-750 p-4 border-b border-gray-700">
                                    <h3 className="text-lg font-bold text-gray-200 flex items-center">
                                        <span className="bg-teal-900 text-teal-200 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded">ΙΣΤΟΡΙΚΟ</span>
                                        Μηνιαία Κίνηση
                                    </h3>
                                </div>
                                <div className="overflow-x-auto max-h-60 custom-scrollbar-dark">
                                    <table className="min-w-full divide-y divide-gray-700">
                                        <thead className="bg-gray-700 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-bold text-gray-300 uppercase">Μήνας</th>
                                                <th className="px-4 py-2 text-center text-xs font-bold text-gray-300 uppercase">Τιμολόγια</th>
                                                <th className="px-4 py-2 text-right text-xs font-bold text-gray-300 uppercase">Σύνολο</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                                            {monthlyStats.map((item, index) => (
                                                <tr key={index} className="hover:bg-orange-900/20">
                                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-200 capitalize">{item.name}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-400">{item.count}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-bold text-orange-400">{formatCurrency(item.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
                
                {/* Footer */}
                <div className="bg-gray-800 p-4 border-t border-gray-700 text-right">
                    <button onClick={onClose} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold rounded-lg transition shadow-sm border border-gray-600">
                        Κλείσιμο
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENT: Λεπτομέρειες Τιμολογίου (Dark Mode) ---
const InvoiceDetailsModal = ({ invoice, onClose }) => {
    if (!invoice) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4 backdrop-blur-sm">
            <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100 animate-fade-in-up border border-gray-700">
                {/* Header */}
                <div className="bg-indigo-900 p-5 text-white flex justify-between items-center shadow-md">
                    <div>
                        <p className="text-xs uppercase tracking-wider opacity-80 font-semibold text-indigo-200">Αριθμός Τιμολογίου</p>
                        <h2 className="text-2xl font-bold">{invoice.number}</h2>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="bg-white bg-opacity-10 hover:bg-opacity-20 rounded-full p-2 transition focus:outline-none"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Date & Supplier Grid */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="bg-gray-700 p-3 rounded-lg border border-gray-600">
                            <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Ημερομηνία</p>
                            <p className="font-medium text-gray-200 text-lg">
                                {invoice.date ? invoice.date.toLocaleDateString('el-GR') : '-'}
                            </p>
                        </div>
                        <div className="bg-gray-700 p-3 rounded-lg border border-gray-600">
                            <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Προμηθευτής</p>
                            <p className="font-medium text-indigo-400 text-lg">{invoice.supplier}</p>
                        </div>
                    </div>

                    {/* Amount */}
                    <div className="text-center py-5 bg-green-900/20 rounded-xl border border-green-900/50 shadow-sm">
                        <p className="text-xs text-green-400 font-semibold uppercase mb-1">Τελικό Ποσό Πληρωμής</p>
                        <p className="text-4xl font-extrabold text-green-400 tracking-tight">
                            {formatCurrency(invoice.amount)}
                        </p>
                    </div>

                    {/* Full Description Area */}
                    <div>
                        <p className="text-sm text-gray-400 font-bold mb-2 flex items-center">
                            <svg className="w-4 h-4 mr-1 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7"></path></svg>
                            Αναλυτική Περιγραφή / Υλικά
                        </p>
                        <div className="bg-gray-700 p-4 rounded-xl border border-gray-600 max-h-64 overflow-y-auto shadow-inner text-gray-200 leading-relaxed whitespace-pre-wrap">
                            {invoice.description ? invoice.description : <span className="text-gray-500 italic">Δεν υπάρχει περιγραφή.</span>}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-800 border-t border-gray-700 flex justify-end">
                    <button 
                        onClick={onClose} 
                        className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold rounded-lg transition shadow-sm border border-gray-600"
                    >
                        Κλείσιμο
                    </button>
                </div>
            </div>
        </div>
    );
};

// Component: Custom Confirmation Modal (Dark Mode)
const ConfirmationModal = ({ isOpen, message, onConfirm, onCancel, content }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[110] p-4" style={{zIndex: 110}}>
            <div className="bg-gray-800 rounded-xl p-6 shadow-2xl max-w-sm w-full border border-gray-700">
                <h3 className="text-lg font-bold text-red-400 mb-4">Επιβεβαίωση Ενέργειας</h3>
                <div className="text-gray-300 mb-6">
                    {content ? content : message}
                </div>
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition border border-gray-600"
                    >
                        Ακύρωση
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition shadow-md"
                    >
                        Διαγραφή
                    </button>
                </div>
            </div>
        </div>
    );
};

// Main Application Component
function App() {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pdfGenerating, setPdfGenerating] = useState(false);

    const initialInvoiceState = {
        supplier: '', number: '', date: '', amount: '', description: '',
    };
    const [newInvoice, setNewInvoice] = useState(initialInvoiceState);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState(null);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [invoiceToDelete, setInvoiceToDelete] = useState(null);
    const [potentialDuplicateId, setPotentialDuplicateId] = useState(null); 

    const [sortBy, setSortBy] = useState('dateDesc'); 
    const [groupBy, setGroupBy] = useState('none'); 
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    const [showStatsModal, setShowStatsModal] = useState(false);
    const [viewInvoice, setViewInvoice] = useState(null);

    // Φόρτωση βιβλιοθηκών
    useEffect(() => {
        const loadScript = (src) => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.async = true;
                script.onload = resolve;
                script.onerror = reject;
                document.body.appendChild(script);
            });
        };

        const loadLibraries = async () => {
            try {
                await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
                await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
                console.log("PDF libraries loaded successfully");
            } catch (err) {
                console.error("Failed to load PDF libraries", err);
            }
        };

        loadLibraries();
        return () => {};
    }, []);

    useEffect(() => {
        if (!initializeApp || !firebaseConfig) {
            // Αν δεν υπάρχουν τα κλειδιά (π.χ. στο Vercel αν δεν τα έβαλες), δείξε σφάλμα
            console.error('Firebase Setup Error: initializeApp or firebaseConfig is missing.');
            setError('ΣΦΑΛΜΑ: Τα κρίσιμα modules του Firebase ή οι ρυθμίσεις δεν φορτώθηκαν. Βεβαιωθείτε ότι έχετε ορίσει τα Environment Variables.');
            setLoading(false);
            return;
        }

        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const firebaseAuth = getAuth(app);
            setDb(firestore);
            setAuth(firebaseAuth);

            let authCheckComplete = false;
            const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                    setLoading(false); 
                } else if (!authCheckComplete) {
                    try {
                        if (initialAuthToken) {
                            await signInWithCustomToken(firebaseAuth, initialAuthToken);
                        } else {
                            await signInAnonymously(firebaseAuth);
                        }
                    } catch (e) {
                        console.error("Firebase Auth Error:", e);
                        setError('Αποτυχία σύνδεσης στο Firebase.');
                        setLoading(false); 
                    }
                }
                authCheckComplete = true; 
            });

            return () => unsubscribe();
        } catch (e) {
            console.error("Firebase Initialization Error:", e);
            setError('Αδυναμία αρχικοποίησης του Firebase.');
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!db || !userId) {
            return;
        }

        // --- PUBLIC PATH ---
        const collectionPath = `artifacts/${appId}/public/data/invoices`;
        
        const invoicesCollection = collection(db, collectionPath);
        const q = query(invoicesCollection);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const invoicesData = snapshot.docs.map(doc => {
                const data = doc.data();
                let parsedDate = null;

                if (data.date) {
                    if (data.date.toDate) {
                        parsedDate = data.date.toDate();
                    } else if (data.date instanceof Date) {
                        parsedDate = data.date;
                    } else if (typeof data.date === 'string') {
                        parsedDate = new Date(data.date);
                    }
                } else if (data.createdAt && data.createdAt.toDate) {
                    parsedDate = data.createdAt.toDate();
                }

                return {
                    id: doc.id,
                    ...data,
                    date: parsedDate,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                };
            });
            
            setInvoices(invoicesData);
            
            if (viewInvoice) {
                const updatedView = invoicesData.find(inv => inv.id === viewInvoice.id);
                if (updatedView) setViewInvoice(updatedView);
            }

        }, (e) => {
            console.error("Firestore Snapshot Error:", e);
            if (!error || !error.includes('ΣΦΑΛΜΑ: Τα κρίσιμα modules')) {
                setError('Αποτυχία φόρτωσης τιμολογίων. Ελέγξτε τα δικαιώματα πρόσβασης.');
            }
        });

        return () => unsubscribe();
    }, [db, userId, viewInvoice]); 

    // --- AUTO-SCROLL TO DUPLICATE ---
    useEffect(() => {
        if (potentialDuplicateId) {
            // Βρίσκουμε το DOM element του διπλότυπου τιμολογίου
            const element = document.getElementById(`invoice-${potentialDuplicateId}`);
            if (element) {
                // Κάνουμε smooth scroll για να έρθει στο κέντρο
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [potentialDuplicateId]); // Τρέχει κάθε φορά που αλλάζει το ID του διπλότυπου

    const checkPotentialDuplicate = (invoiceToCheck) => {
        const match = invoices.find(invoice => 
            (invoice.supplier || '').toLowerCase().trim() === (invoiceToCheck.supplier || '').toLowerCase().trim() &&
            (invoice.number || '').toLowerCase().trim() === (invoiceToCheck.number || '').toLowerCase().trim()
        );

        if (match) {
            setPotentialDuplicateId(match.id);
            if (!error || error.startsWith('ΠΡΟΣΟΧΗ')) {
                setError(`ΠΡΟΣΟΧΗ: Υπάρχει ήδη καταχωρημένο τιμολόγιο με αριθμό "${invoiceToCheck.number}" από τον προμηθευτή "${invoiceToCheck.supplier}".`);
            }
        } else {
            setPotentialDuplicateId(null);
            if (error && error.startsWith('ΠΡΟΣΟΧΗ')) {
                setError(null);
            }
        }
        return !!match; 
    };
    
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        let sanitizedValue = value;
        
        if (name === 'amount' && value !== '') {
            if (isNaN(parseFloat(value))) return;
        }

        const updatedInvoice = { ...newInvoice, [name]: sanitizedValue };
        setNewInvoice(updatedInvoice);
        
        if (updatedInvoice.supplier && updatedInvoice.number) {
            checkPotentialDuplicate(updatedInvoice);
        } else {
            setPotentialDuplicateId(null);
            if (error && error.startsWith('ΠΡΟΣΟΧΗ')) {
                setError(null);
            }
        }
    };

    const handleClearForm = () => {
        setNewInvoice(initialInvoiceState);
        setPotentialDuplicateId(null);
        setError(null);
    };

    const handleAddInvoice = async (e) => {
        e.preventDefault();
        if (!db || !userId) return;

        if (!newInvoice.supplier || !newInvoice.number || !newInvoice.date || !newInvoice.amount) {
            setError('Παρακαλώ συμπληρώστε όλα τα βασικά πεδία.');
            return;
        }
        const parsedAmount = parseFloat(newInvoice.amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            setError('Παρακαλώ εισαγάγετε έγκυρο ποσό.');
            return;
        }

        // Keep the check for feedback, but proceed to overwrite/merge
        const isDuplicate = checkPotentialDuplicate(newInvoice);
        
        try {
            setError(null);
            // --- ΔΙΟΡΘΩΣΗ: PUBLIC PATH ---
            const collectionPath = `artifacts/${appId}/public/data/invoices`;
            
            // --- ΔΙΟΡΘΩΣΗ: ΜΟΝΑΔΙΚΟ ID ---
            // Δημιουργούμε ένα ID που είναι μοναδικό για κάθε συνδυασμό Προμηθευτή + Αριθμού.
            const uniqueDocId = `${newInvoice.supplier}-${newInvoice.number}`
                .toLowerCase()
                .trim()
                .replace(/[\/\s\\]/g, '_'); // Αντικαθιστούμε κενά και καθέτους με underscore

            const dataToSave = {
                ...newInvoice,
                amount: parsedAmount, 
                date: new Date(newInvoice.date), 
                createdAt: serverTimestamp(),
                createdBy: userId // Αποθηκεύουμε ποιος το έφτιαξε, ακόμα και αν είναι public
            };
            
            // Χρησιμοποιούμε setDoc με συγκεκριμένο ID αντί για addDoc
            await setDoc(doc(db, collectionPath, uniqueDocId), dataToSave);
            
            handleClearForm();
        } catch (e) {
            console.error("Error adding document: ", e);
            setError('Σφάλμα κατά την καταχώρηση του τιμολογίου.');
        }
    };
    
    const startDelete = (id) => {
        setInvoiceToDelete(id);
        setIsModalOpen(true);
    };
    
    const cancelDelete = () => {
        setInvoiceToDelete(null);
        setIsModalOpen(false);
        setError(null);
    };

    const confirmDeleteInvoice = async () => {
        if (!db || !userId || !invoiceToDelete) return;
        
        try {
            setError(null);
            // --- ΔΙΟΡΘΩΣΗ: PUBLIC PATH ---
            const docPath = `artifacts/${appId}/public/data/invoices/${invoiceToDelete}`;
            
            await deleteDoc(doc(db, docPath));
            
            if (viewInvoice && viewInvoice.id === invoiceToDelete) {
                setViewInvoice(null);
            }
            
            cancelDelete();
        } catch (e) {
            console.error("Error deleting document: ", e);
            setError('Σφάλμα κατά τη διαγραφή του τιμολογίου.');
            cancelDelete();
        }
    };

    const handleDownloadPDF = async () => {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('Η βιβλιοθήκη PDF δεν έχει φορτώσει ακόμα. Παρακαλώ περιμένετε λίγο και ξαναδοκιμάστε.');
            return;
        }

        setPdfGenerating(true);

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const fontUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf';
            const response = await fetch(fontUrl);
            const fontBuffer = await response.arrayBuffer();
            const fontBase64 = arrayBufferToBase64(fontBuffer);
            
            const fontFileName = "Roboto-Regular.ttf";
            doc.addFileToVFS(fontFileName, fontBase64);
            doc.addFont(fontFileName, "Roboto", "normal");
            doc.setFont("Roboto"); 

            doc.setFontSize(18);
            doc.text("Αναφορά Τιμολογίων", 14, 20);
            
            doc.setFontSize(10);
            doc.text(`Ημερομηνία: ${new Date().toLocaleDateString('el-GR')}`, 14, 28);
            if (startDate && endDate) {
                doc.text(`Περίοδος: ${new Date(startDate).toLocaleDateString('el-GR')} - ${new Date(endDate).toLocaleDateString('el-GR')}`, 14, 34);
            }

            if (invoiceSummary.count > 0) {
                doc.setDrawColor(200, 200, 200);
                doc.setFillColor(245, 247, 250);
                doc.rect(14, 40, 180, 12, 'FD'); 
                doc.setFontSize(11);
                doc.text(`Σύνολο Τιμολογίων: ${invoiceSummary.count}`, 20, 48);
                doc.text(`Συνολικό Ποσό: ${formatCurrency(invoiceSummary.totalAmount)}`, 140, 48);
            }

            let startY = 60;

            const groups = Object.keys(sortedAndFilteredInvoices.grouped);
            
            for (let i = 0; i < groups.length; i++) {
                const groupName = groups[i];
                const groupData = sortedAndFilteredInvoices.grouped[groupName];
                const groupSummary = groupedSummaries[groupName];

                if (groupBy !== 'none') {
                    if (startY > 270) {
                        doc.addPage();
                        startY = 20;
                    }
                    
                    doc.setFontSize(12);
                    doc.setFillColor(79, 70, 229); 
                    doc.setTextColor(255, 255, 255);
                    doc.rect(14, startY, 182, 8, 'F');
                    doc.text(`Ομάδα: ${groupName}`, 16, startY + 5.5);
                    doc.text(`Σύνολο: ${formatCurrency(groupSummary.total)}`, 150, startY + 5.5);
                    
                    startY += 10;
                    doc.setTextColor(0, 0, 0); 
                }

                const tableBody = groupData.map(inv => [
                    inv.date ? new Date(inv.date).toLocaleDateString('el-GR') : '-',
                    inv.supplier,
                    inv.number,
                    formatCurrency(inv.amount),
                    inv.description || '-'
                ]);

                doc.autoTable({
                    startY: startY,
                    head: [['Ημερομηνία', 'Προμηθευτής', 'Αρ. Τιμολογίου', 'Ποσό', 'Περιγραφή']],
                    body: tableBody,
                    theme: 'striped',
                    styles: { 
                        font: "Roboto",
                        fontSize: 9,
                        cellPadding: 3
                    },
                    headStyles: {
                        fillColor: [243, 244, 246], 
                        textColor: [55, 65, 81],
                        fontStyle: 'bold'
                    },
                    columnStyles: {
                        3: { halign: 'right', fontStyle: 'bold' } 
                    },
                    margin: { top: 20 },
                });

                startY = doc.lastAutoTable.finalY + 15;
            }

            doc.save(`invoices_report_${new Date().toISOString().split('T')[0]}.pdf`);
            setPdfGenerating(false);

        } catch (err) {
            console.error("PDF Generation Error:", err);
            setPdfGenerating(false);
            alert("Σφάλμα κατά τη δημιουργία του PDF: " + err.message);
        }
    };

    const sortedAndFilteredInvoices = useMemo(() => {
        let currentInvoices = invoices;

        if (startDate || endDate) {
            currentInvoices = currentInvoices.filter(invoice => {
                if (!invoice.date) return false;

                const year = invoice.date.getFullYear();
                const month = String(invoice.date.getMonth() + 1).padStart(2, '0');
                const day = String(invoice.date.getDate()).padStart(2, '0');
                const invoiceDateStr = `${year}-${month}-${day}`;

                let isAfterStart = true;
                let isBeforeEnd = true;

                if (startDate) {
                    isAfterStart = invoiceDateStr >= startDate;
                }

                if (endDate) {
                    isBeforeEnd = invoiceDateStr <= endDate;
                }

                return isAfterStart && isBeforeEnd;
            });
        }

        if (searchTerm) {
            const lowerCaseSearch = searchTerm.toLowerCase();
            currentInvoices = currentInvoices.filter(invoice => 
                (invoice.supplier || '').toLowerCase().includes(lowerCaseSearch) ||
                (invoice.number || '').toLowerCase().includes(lowerCaseSearch) ||
                (invoice.description || '').toLowerCase().includes(lowerCaseSearch) ||
                String(invoice.amount).includes(lowerCaseSearch)
            );
        }

        const sorted = [...currentInvoices].sort((a, b) => {
            if (sortBy === 'dateDesc') {
                return (b.date || b.createdAt) - (a.date || a.createdAt);
            }
            if (sortBy === 'dateAsc') {
                return (a.date || a.createdAt) - (b.date || b.createdAt);
            }
            if (sortBy === 'amountDesc') {
                return (b.amount || 0) - (a.amount || 0);
            }
            if (sortBy === 'amountAsc') {
                return (a.amount || 0) - (b.amount || 0);
            }
            if (sortBy === 'supplierAsc') {
                return (a.supplier || '').localeCompare(b.supplier || '');
            }
            return 0;
        });

        const grouped = {};
        if (groupBy === 'none') {
            grouped['Όλα τα Τιμολόγια'] = sorted;
        } else if (groupBy === 'supplier') {
            sorted.forEach(invoice => {
                const key = invoice.supplier || 'Άγνωστος Προμηθευτής';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(invoice);
            });
        } else if (groupBy === 'month') {
            sorted.forEach(invoice => {
                const date = invoice.date || invoice.createdAt || new Date();
                const key = date.toLocaleDateString('el-GR', { year: 'numeric', month: 'long' });
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(invoice);
            });
        }
        
        return { grouped, flatList: sorted };

    }, [invoices, searchTerm, sortBy, groupBy, startDate, endDate]);

    const invoiceSummary = useMemo(() => {
        const totalAmount = sortedAndFilteredInvoices.flatList.reduce((sum, invoice) => {
            const amount = parseFloat(invoice.amount);
            return sum + (isNaN(amount) ? 0 : amount);
        }, 0);

        return {
            count: sortedAndFilteredInvoices.flatList.length,
            totalAmount: totalAmount,
        };
    }, [sortedAndFilteredInvoices]);
    
    const groupedSummaries = useMemo(() => {
        const summaries = {};
        for (const groupName in sortedAndFilteredInvoices.grouped) {
            const groupList = sortedAndFilteredInvoices.grouped[groupName];
            const total = groupList.reduce((sum, invoice) => sum + (parseFloat(invoice.amount) || 0), 0);
            summaries[groupName] = { count: groupList.length, total: total };
        }
        return summaries;
    }, [sortedAndFilteredInvoices.grouped]);

    const invoiceToDeleteData = useMemo(() => {
        return invoices.find(inv => inv.id === invoiceToDelete);
    }, [invoices, invoiceToDelete]);


    if (loading) {
        if (error && error.includes('ΣΦΑΛΜΑ')) {
            return (
                <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
                    <div className="text-xl font-semibold text-red-400 p-6 border-2 border-red-800 rounded-xl shadow-lg bg-gray-800">
                        {error}
                    </div>
                </div>
            );
        }
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900">
                <div className="text-xl font-semibold text-indigo-400 animate-pulse">
                    Φόρτωση εφαρμογής...
                </div>
            </div>
        );
    }

    const ErrorDisplay = () => {
        if (!error) return null;
        
        const isDuplicateError = error && (error.includes('διπλότυπο') || error.startsWith('ΠΡΟΣΟΧΗ'));
        const errorClass = isDuplicateError ? 'bg-pink-900 text-pink-200 border-pink-700' : 'bg-red-900 text-red-200 border-red-700';

        return (
            <div className={`p-4 mb-4 border-l-4 rounded-lg font-medium ${errorClass} shadow-md`}>
                {error}
            </div>
        );
    }
    
    // Αλλαγή ΕΔΩ: Dark Mode Table
    const GroupedInvoiceTable = ({ groupName, invoices, summary }) => (
        <div className="mb-8 border border-gray-700 rounded-lg shadow-sm">
            {groupBy !== 'none' && (
                <div 
                    className="bg-indigo-900 text-indigo-100 p-3 rounded-t-lg flex justify-between font-bold text-lg group-header border-b border-indigo-800"
                    style={{ pageBreakAfter: 'avoid' }} 
                >
                    <span>Ομάδα: {groupName}</span>
                    <span>Σύνολο: {formatCurrency(summary.total)} ({summary.count} τεμ.)</span>
                </div>
            )}
            <div className="overflow-y-auto max-h-[500px] custom-scrollbar-dark border-t border-gray-700">
                <table className="min-w-full divide-y divide-gray-700 relative">
                    <thead className={groupBy !== 'none' ? 'bg-gray-800 sticky top-0 z-10 shadow-sm' : 'bg-gray-800 sticky top-0 z-10 shadow-sm'}>
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Ημερομηνία</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Προμηθευτής</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Αρ. Τιμολογίου</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Ποσό</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Περιγραφή</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider" data-html2canvas-ignore="true">Ενέργειες</th>
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                        {invoices.map((invoice) => (
                            <tr 
                                key={invoice.id} 
                                id={`invoice-${invoice.id}`}
                                onClick={() => setViewInvoice(invoice)}
                                className={`${invoice.id === potentialDuplicateId ? 'animate-highlight-pulse border-l-4 border-red-500' : ''} cursor-pointer hover:bg-gray-700 transition-colors invoice-row`}
                                style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                                title="Κάντε κλικ για λεπτομέρειες"
                            >
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{invoice.date ? invoice.date.toLocaleDateString('el-GR') : 'N/A'}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-indigo-400">{invoice.supplier}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400">{invoice.number}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-right text-green-400">{formatCurrency(invoice.amount)}</td>
                                <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{invoice.description || '-'}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-medium" data-html2canvas-ignore="true">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); startDelete(invoice.id); }} 
                                        className="text-red-400 hover:text-red-300 bg-red-900/30 hover:bg-red-900/50 p-2 rounded-full z-10 relative transition border border-red-900/50"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-8 font-sans antialiased">
            {/* CSS για καλύτερο έλεγχο εκτύπωσης & Dark Mode Scrollbar */}
            <style>{`
                @media print {
                    thead { display: table-header-group; }
                    .shadow-lg, .shadow-md, .shadow-sm, .shadow-inner {
                        box-shadow: none !important;
                    }
                    .rounded-xl, .rounded-lg, .rounded-md, .rounded {
                        border-radius: 0 !important;
                    }
                }
                
                tr {
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                }
                
                .group-header {
                    page-break-after: avoid !important;
                    break-after: avoid !important;
                }

                /* Dark Scrollbar */
                .custom-scrollbar-dark::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar-dark::-webkit-scrollbar-track {
                    background: #1f2937; /* gray-800 */
                }
                .custom-scrollbar-dark::-webkit-scrollbar-thumb {
                    background: #4b5563; /* gray-600 */
                    border-radius: 4px;
                }
                .custom-scrollbar-dark::-webkit-scrollbar-thumb:hover {
                    background: #6b7280; /* gray-500 */
                }

                /* Light Scrollbar for the white paper section */
                .custom-scrollbar-light::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar-light::-webkit-scrollbar-track {
                    background: #f3f4f6; /* gray-100 */
                }
                .custom-scrollbar-light::-webkit-scrollbar-thumb {
                    background: #d1d5db; /* gray-300 */
                    border-radius: 4px;
                }
                .custom-scrollbar-light::-webkit-scrollbar-thumb:hover {
                    background: #9ca3af; /* gray-400 */
                }

                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 0.3s ease-out forwards;
                }

                /* New Strong Highlight Pulse Animation */
                @keyframes highlight-pulse {
                    0%, 100% { background-color: rgba(88, 28, 135, 0); } /* transparent/dark base */
                    50% { background-color: rgba(220, 38, 38, 0.5); } /* strong red */
                }
                .animate-highlight-pulse {
                    animation: highlight-pulse 1.5s ease-in-out infinite;
                }
            `}</style>

            {/* Modal Λεπτομερειών (Details) */}
            <InvoiceDetailsModal 
                invoice={viewInvoice} 
                onClose={() => setViewInvoice(null)} 
            />

            {/* Modal Στατιστικών (Statistics) */}
            {showStatsModal && (
                <StatisticsModal 
                    invoices={invoices} 
                    onClose={() => setShowStatsModal(false)} 
                />
            )}

            <ConfirmationModal 
                isOpen={isModalOpen} 
                content={
                    invoiceToDeleteData ? (
                        <div>
                            <p className="mb-3 text-gray-300">Πρόκειται να διαγράψετε οριστικά το παρακάτω τιμολόγιο:</p>
                            <div className="bg-gray-700 p-3 rounded text-sm mb-3 border border-gray-600 text-gray-200">
                                <p><strong>Ημερομηνία:</strong> {invoiceToDeleteData.date ? invoiceToDeleteData.date.toLocaleDateString('el-GR') : '-'}</p>
                                <p><strong>Προμηθευτής:</strong> {invoiceToDeleteData.supplier}</p>
                                <p><strong>Αρ. Τιμολογίου:</strong> {invoiceToDeleteData.number}</p>
                                <p><strong>Ποσό:</strong> {formatCurrency(invoiceToDeleteData.amount)}</p>
                            </div>
                            <p className="font-bold text-red-400">Η ενέργεια δεν αναιρείται.</p>
                        </div>
                    ) : "Πρόκειται να διαγράψετε οριστικά αυτό το τιμολόγιο. Είστε σίγουροι;"
                }
                onConfirm={confirmDeleteInvoice} 
                onCancel={cancelDelete} 
            />
        
            <header className="mb-8 border-b border-gray-700 pb-6">
                <h1 className="text-3xl md:text-4xl font-extrabold text-indigo-400 mb-2">Διαχείριση Τιμολογίων Προμηθευτών</h1>
                <p className="text-gray-400">User ID: <code className="bg-gray-800 p-1 rounded text-sm select-all text-gray-300 border border-gray-700">{userId}</code></p>
                <div className="bg-blue-900/30 text-blue-200 p-3 rounded-lg mt-3 text-sm flex items-center inline-flex border border-blue-800/50">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span><strong>Συμβουλή:</strong> Κάντε κλικ σε μια γραμμή για να δείτε την <strong>πλήρη περιγραφή</strong> και τις λεπτομέρειες.</span>
                </div>
            </header>
            
            <ErrorDisplay />

            <section className="bg-gray-800 p-6 rounded-xl shadow-lg mb-8 border border-gray-700">
                <h2 className="text-2xl font-semibold text-indigo-400 mb-4 border-b border-gray-700 pb-2">Καταχώριση Νέου Τιμολογίου</h2>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <input type="text" name="supplier" placeholder="Προμηθευτής (Π.χ. Public)" value={newInvoice.supplier} onChange={handleInputChange} required className="col-span-1 md:col-span-1 p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150" />
                    <input type="text" name="number" placeholder="Αριθμός Τιμολογίου" value={newInvoice.number} onChange={handleInputChange} required className="col-span-1 md:col-span-1 p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150" />
                    <input type="date" name="date" placeholder="Ημερομηνία" value={newInvoice.date} onChange={handleInputChange} required className="col-span-1 md:col-span-1 p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150" />
                    <input type="number" name="amount" placeholder="Ποσό (€)" value={newInvoice.amount} onChange={handleInputChange} required step="0.01" className="col-span-1 md:col-span-1 p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150" />
                    <textarea name="description" placeholder="Περιγραφή / Υλικά (Γράψτε αναλυτικά...)" value={newInvoice.description} onChange={handleInputChange} className="col-span-1 md:col-span-5 p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 h-24" />
                </div>
                <div className="flex space-x-4 mt-4 justify-end">
                    <button type="button" onClick={handleClearForm} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-md hover:shadow-lg w-full md:w-auto border border-gray-500">Καθαρισμός</button>
                    <button type="submit" onClick={handleAddInvoice} className={`font-bold py-3 px-4 rounded-lg transition duration-200 shadow-md hover:shadow-lg w-full md:w-auto ${potentialDuplicateId !== null ? 'bg-pink-700 text-white opacity-70 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`} disabled={potentialDuplicateId !== null}>Καταχώριση</button>
                </div>
            </section>

            <section className="bg-gray-800 p-6 rounded-xl shadow-lg mb-4 border border-gray-700">
                <div className="flex flex-col space-y-4 mb-6">
                    <div className="flex flex-col md:flex-row justify-between items-center">
                        <h2 className="text-2xl font-semibold text-indigo-400 mb-4 md:mb-0 flex items-center space-x-3">
                            Πίνακας Τιμολογίων
                            <button onClick={() => {setSearchTerm(''); setStartDate(''); setEndDate('');}} className="p-2 bg-indigo-900/50 text-indigo-300 rounded-full hover:bg-indigo-800/50 transition duration-150 shadow-md border border-indigo-700" title="Επιστροφή στην αρχική λίστα">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                            </button>
                        </h2>
                        <input type="text" placeholder="Αναζήτηση..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full md:w-1/3 p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150" />
                    </div>
                    
                    <div className="flex flex-wrap items-end gap-3 mt-4 md:mt-0">
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1">Από:</label>
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="p-2 bg-gray-700 border border-gray-600 rounded-md text-sm w-32 text-white focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1">Έως:</label>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="p-2 bg-gray-700 border border-gray-600 rounded-md text-sm w-32 text-white focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        
                        <button type="button" onClick={handleDownloadPDF} disabled={pdfGenerating} className="px-3 py-2 bg-green-700 text-white text-sm font-semibold rounded-md hover:bg-green-600 transition shadow-sm flex items-center space-x-2 h-[38px] disabled:opacity-50 ml-auto md:ml-0 border border-green-600">
                            <span>{pdfGenerating ? 'Λήψη...' : 'Εξαγωγή PDF'}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z"></path></svg>
                        </button>
                        
                        <button 
                            type="button" 
                            onClick={() => setShowStatsModal(true)} 
                            className={`px-3 py-2 text-sm font-semibold rounded-md transition shadow-sm flex items-center space-x-2 h-[38px] ${showStatsModal ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-indigo-300 border border-indigo-500 hover:bg-gray-600'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            <span>Στατιστικά</span>
                        </button>
                    </div>

                    <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 pt-4 border-t border-gray-700 mt-4">
                        <div className="flex items-center space-x-2 w-full md:w-1/2">
                            <label className="text-gray-400 font-medium whitespace-nowrap">Ταξινόμηση:</label>
                            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-indigo-500 focus:border-indigo-500"><option value="dateDesc">Ημερομηνία (Πιο πρόσφατα)</option><option value="dateAsc">Ημερομηνία (Πιο παλιά)</option><option value="amountDesc">Ποσό (Ακριβότερα)</option><option value="amountAsc">Ποσό (Φθηνότερα)</option><option value="supplierAsc">Προμηθευτής (Α-Ω)</option></select>
                        </div>
                        <div className="flex items-center space-x-2 w-full md:w-1/2">
                            <label className="text-gray-400 font-medium whitespace-nowrap">Ομαδοποίηση:</label>
                            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-indigo-500 focus:border-indigo-500"><option value="none">Καμία</option><option value="supplier">Ανά Προμηθευτή</option><option value="month">Ανά Μήνα</option></select>
                        </div>
                    </div>
                </div>
            </section>

            {/* Printable Area: Λευκό για να μοιάζει με χαρτί */}
            <div id="printable-area" className="bg-white p-6 rounded-xl shadow-lg text-gray-900 border border-gray-300">
                <div className="mb-6 border-b border-gray-300 pb-4">
                    <h2 className="text-2xl font-bold text-gray-800">Αναφορά Τιμολογίων</h2>
                    <p className="text-sm text-gray-600">Ημερομηνία: {new Date().toLocaleDateString('el-GR')}</p>
                    {startDate && endDate && <p className="text-sm text-gray-600">Περίοδος: {new Date(startDate).toLocaleDateString('el-GR')} - {new Date(endDate).toLocaleDateString('el-GR')}</p>}
                </div>

                {invoiceSummary.count > 0 && (
                    <div className="mb-6 p-3 bg-indigo-50 border-l-4 border-indigo-500 rounded-lg shadow-inner flex justify-between font-semibold text-sm md:text-base">
                        <span className="text-indigo-800">Σύνολο Τιμολογίων: <span className="text-indigo-600">{invoiceSummary.count}</span></span>
                        <span className="text-indigo-800">Συνολικό Ποσό: <span className="text-lg font-bold text-green-700">{formatCurrency(invoiceSummary.totalAmount)}</span></span>
                    </div>
                )}

                {Object.keys(sortedAndFilteredInvoices.grouped).length === 0 ? (
                    <p className="text-center text-gray-500 py-8">Δεν βρέθηκαν τιμολόγια.</p>
                ) : (
                    <div className="text-gray-900 max-h-[750px] overflow-y-auto custom-scrollbar-light pr-2">
                        {Object.keys(sortedAndFilteredInvoices.grouped).map(groupName => (
                            <div key={groupName} className="mb-8 border border-gray-200 rounded-lg shadow-sm">
                                {groupBy !== 'none' && (
                                    <div className="bg-indigo-600 text-white p-3 rounded-t-lg flex justify-between font-bold text-lg">
                                        <span>Ομάδα: {groupName}</span>
                                        <span>Σύνολο: {formatCurrency(groupedSummaries[groupName].total)} ({groupedSummaries[groupName].count} τεμ.)</span>
                                    </div>
                                )}
                                <div className="">
                                    <table className="min-w-full divide-y divide-gray-200 text-gray-900">
                                        <thead className={groupBy !== 'none' ? 'bg-indigo-50' : 'bg-gray-100'}>
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Ημερομηνία</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Προμηθευτής</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Αρ. Τιμολογίου</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Ποσό</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Περιγραφή</th>
                                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">Ενέργειες</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-100">
                                            {sortedAndFilteredInvoices.grouped[groupName].map((invoice) => (
                                                <tr 
                                                    key={invoice.id} 
                                                    id={`invoice-${invoice.id}`}
                                                    onClick={() => setViewInvoice(invoice)}
                                                    className={`${invoice.id === potentialDuplicateId ? 'animate-highlight-pulse border-l-4 border-red-500' : ''} cursor-pointer hover:bg-gray-50 transition-colors`}
                                                >
                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{invoice.date ? invoice.date.toLocaleDateString('el-GR') : 'N/A'}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-indigo-600">{invoice.supplier}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{invoice.number}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-right text-green-700">{formatCurrency(invoice.amount)}</td>
                                                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{invoice.description || '-'}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-medium">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); startDelete(invoice.id); }} 
                                                            className="text-red-600 hover:text-red-900 bg-red-100 p-2 rounded-full z-10 relative hover:bg-red-200 transition"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;