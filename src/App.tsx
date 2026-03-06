import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  CheckSquare, 
  MessageSquare, 
  Settings, 
  Plus, 
  Search, 
  Bell, 
  Sparkles,
  TrendingUp,
  Clock,
  AlertCircle,
  ChevronRight,
  MoreVertical,
  Send,
  X,
  Trash2,
  Filter,
  User,
  Moon,
  Sun,
  Shield,
  Key,
  UserCog
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell
} from 'recharts';
import { io } from 'socket.io-client';
import { cn } from './lib/utils';
import { Task, Stat, Message } from './types';
import { geminiService } from './services/geminiService';
import { LogOut, UserPlus, LogIn } from 'lucide-react';

const socket = io();

export default function App() {
  const [user, setUser] = useState<{ id: number, username: string, role: string, avatar?: string } | null>(() => {
    try {
      const saved = localStorage.getItem('user');
      const parsed = saved ? JSON.parse(saved) : null;
      return parsed && parsed.username ? parsed : null;
    } catch (e) {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'chat' | 'settings' | 'admin'>('dashboard');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [notifications, setNotifications] = useState<{ id: number, text: string, time: string, read: boolean }[]>([
    { id: 1, text: "New task assigned to you", time: "5m ago", read: false },
    { id: 2, text: "Project 'Nexus' updated", time: "1h ago", read: true }
  ]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'user' });
  const [profileForm, setProfileForm] = useState({ username: '', password: '', avatar: '' });
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });
  const chatEndRef = useRef<HTMLDivElement>(null);

  // New Task Form State
  const [newTask, setNewTask] = useState({ title: '', priority: 'medium' as Task['priority'] });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  const handleLogin = (userData: { user: any, token: string }) => {
    console.log('Login successful, user data:', userData.user);
    setUser(userData.user);
    setToken(userData.token);
    localStorage.setItem('user', JSON.stringify(userData.user));
    localStorage.setItem('token', userData.token);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      handleLogout();
      throw new Error('Unauthorized');
    }
    return res;
  };

  useEffect(() => {
    if (!token) return;

    const fetchProfile = async () => {
      try {
        const res = await authFetch('/api/profile');
        const data = await res.json();
        console.log('Profile fetched:', data);
        if (data && data.username && JSON.stringify(data) !== JSON.stringify(user)) {
          setUser(data);
          localStorage.setItem('user', JSON.stringify(data));
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      }
    };

    fetchProfile();
    fetchTasks();
    fetchStats();
    fetchMessages();
    if (user?.role === 'admin') fetchAdminUsers();
    
    setProfileForm({ username: user?.username || '', password: '', avatar: user?.avatar || '' });

    socket.on('task:created', (newTask: Task) => {
      setTasks(prev => [...prev, newTask]);
      fetchStats();
    });

    socket.on('task:updated', (updatedTask: Task) => {
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
      fetchStats();
    });

    socket.on('task:deleted', (id: string) => {
      setTasks(prev => prev.filter(t => t.id !== parseInt(id)));
      fetchStats();
    });

    socket.on('message:new', (msg: Message) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('message:deleted', (id: string) => {
      setMessages(prev => prev.filter(m => m.id !== parseInt(id)));
    });

    socket.on('messages:cleared', () => {
      setMessages([]);
    });

    return () => {
      socket.off('task:created');
      socket.off('task:updated');
      socket.off('task:deleted');
      socket.off('message:new');
      socket.off('message:deleted');
      socket.off('messages:cleared');
    };
  }, [token, user?.role]);

  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const fetchTasks = async () => {
    try {
      const res = await authFetch('/api/tasks');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setTasks(data);
      }
    } catch (err) {}
  };

  const fetchStats = async () => {
    try {
      const res = await authFetch('/api/stats');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setStats(data);
      }
    } catch (err) {}
  };

  const fetchMessages = async () => {
    try {
      const res = await authFetch('/api/messages');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages(data);
      }
    } catch (err) {}
  };

  const fetchAdminUsers = async () => {
    try {
      const res = await authFetch('/api/admin/users');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setAdminUsers(data);
      }
    } catch (err) {}
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify(profileForm)
      });
      const updated = await res.json();
      setUser(updated);
      localStorage.setItem('user', JSON.stringify(updated));
      setIsProfileEditing(false);
      setProfileForm(prev => ({ ...prev, password: '' }));
    } catch (err) {}
  };

  const handleAdminUserAction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await authFetch(`/api/admin/users/${editingUser.id}`, {
          method: 'PATCH',
          body: JSON.stringify(userForm)
        });
      } else {
        await authFetch('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify(userForm)
        });
      }
      fetchAdminUsers();
      setIsUserModalOpen(false);
      setEditingUser(null);
      setUserForm({ username: '', password: '', role: 'user' });
    } catch (err) {}
  };

  const deleteAdminUser = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await authFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      fetchAdminUsers();
    } catch (err) {}
  };

  const openTaskModal = (status?: Task['status']) => {
    if (status) {
      setNewTask(prev => ({ ...prev, status }));
    }
    setIsTaskModalOpen(true);
  };

  const generateAiInsight = async () => {
    setIsAiLoading(true);
    try {
      const insight = await geminiService.analyzeProductivity(tasks);
      setAiInsight(insight || 'No insights available.');
    } catch (error) {
      console.error(error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const updateTaskStatus = async (id: number, status: Task['status']) => {
    try {
      await authFetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
    } catch (err) {}
  };

  const deleteTask = async (id: number) => {
    try {
      await authFetch(`/api/tasks/${id}`, { method: 'DELETE' });
    } catch (err) {}
  };

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    
    try {
      await authFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ ...newTask, status: newTask.status || 'todo' })
      });
      
      setNewTask({ title: '', priority: 'medium' });
      setIsTaskModalOpen(false);
    } catch (err) {}
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    try {
      await authFetch('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ user_name: user?.username, content: chatInput })
      });
      setChatInput('');
    } catch (err) {}
  };

  const deleteMessage = async (id: number) => {
    if (!confirm('Delete this message?')) return;
    try {
      await authFetch(`/api/messages/${id}`, { method: 'DELETE' });
    } catch (err) {}
  };

  const clearAllMessages = async () => {
    if (!confirm('Are you sure you want to clear ALL messages? This cannot be undone.')) return;
    try {
      await authFetch('/api/messages', { method: 'DELETE' });
    } catch (err) {}
  };

  const filteredTasks = (Array.isArray(tasks) ? tasks : []).filter(t => {
    const matchesSearch = (t.title?.toLowerCase() || '').includes(searchQuery?.toLowerCase() || '');
    const matchesFilter = filterStatus === 'all' || t.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-[var(--background)] text-[var(--foreground)] font-sans transition-colors duration-300">
      {/* Sidebar */}
      <aside className="w-64 bg-[var(--card)] border-r border-[var(--border)] flex flex-col transition-colors duration-300">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="text-white w-6 h-6" />
          </div>
          <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400">Nexus AI</span>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          <SidebarItem 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <SidebarItem 
            icon={<CheckSquare size={20} />} 
            label="Tasks" 
            active={activeTab === 'tasks'} 
            onClick={() => setActiveTab('tasks')} 
          />
          <SidebarItem 
            icon={<MessageSquare size={20} />} 
            label="Messages" 
            active={activeTab === 'chat'} 
            onClick={() => setActiveTab('chat')} 
          />
          {user?.role === 'admin' && (
            <SidebarItem 
              icon={<Shield size={20} />} 
              label="Admin" 
              active={activeTab === 'admin'} 
              onClick={() => setActiveTab('admin')} 
            />
          )}
          <SidebarItem 
            icon={<Settings size={20} />} 
            label="Settings" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
        </nav>

        <div className="p-4 mt-auto">
          <div className="bg-indigo-600 dark:bg-indigo-900/50 rounded-2xl p-4 shadow-xl shadow-indigo-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="text-white w-4 h-4" />
              <span className="text-xs font-bold text-indigo-100 uppercase tracking-wider">Pro Plan</span>
            </div>
            <p className="text-xs text-indigo-50 mb-3 font-medium">Unlock advanced AI analysis and unlimited projects.</p>
            <button className="w-full py-2 bg-white text-indigo-600 text-xs font-black rounded-lg hover:bg-indigo-50 transition-colors shadow-sm">
              Upgrade Now
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between px-8 shrink-0 transition-colors duration-300">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search tasks, projects..." 
              className="w-full pl-10 pr-4 py-2 bg-[var(--input)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 dark:text-slate-100"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleDarkMode}
              className="p-2 text-slate-600 dark:text-slate-400 hover:bg-[var(--secondary)] rounded-xl transition-colors"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div className="relative">
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2 text-slate-600 dark:text-slate-400 hover:bg-[var(--secondary)] rounded-xl transition-colors relative"
              >
                <Bell size={20} />
                {notifications.some(n => !n.read) && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-[var(--card)]"></span>
                )}
              </button>
              
              <AnimatePresence>
                {isNotificationsOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsNotificationsOpen(false)}
                    />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-xl z-20 overflow-hidden"
                    >
                      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                        <h4 className="font-bold text-sm">Notifications</h4>
                        <button 
                          onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                          className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider"
                        >
                          Mark all read
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {notifications.length > 0 ? (
                          notifications.map(n => (
                            <div key={n.id} className={cn("p-4 border-b border-[var(--border)] last:border-0 flex gap-3", !n.read && "bg-indigo-50/30 dark:bg-indigo-950/20")}>
                              <div className={cn("w-2 h-2 mt-1.5 rounded-full shrink-0", n.read ? "bg-slate-200 dark:bg-slate-700" : "bg-indigo-500")}></div>
                              <div>
                                <p className="text-xs font-medium text-slate-900 dark:text-slate-100">{n.text}</p>
                                <p className="text-[10px] text-slate-400 mt-1">{n.time}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-8 text-center text-xs text-slate-400">No notifications</div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <div className="h-8 w-px bg-[var(--border)] mx-2"></div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{user.username}</p>
                <div className="flex items-center justify-end gap-1">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">{user.role || 'user'}</p>
                  {user.role === 'admin' && <Shield size={10} className="text-indigo-500" />}
                </div>
              </div>
              <img 
                src={`https://picsum.photos/seed/${user.username}/100/100`} 
                alt="Avatar" 
                className="w-10 h-10 rounded-full border-2 border-[var(--card)] shadow-sm"
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={handleLogout}
                className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex items-end justify-between">
                  <div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Project Overview</h1>
                    <p className="text-slate-600 dark:text-slate-400 mt-1 font-medium">Welcome back! Here's what's happening today.</p>
                  </div>
                  <button 
                    onClick={generateAiInsight}
                    disabled={isAiLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-sm font-semibold hover:bg-[var(--secondary)] transition-all shadow-sm disabled:opacity-50"
                  >
                    {isAiLoading ? (
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Sparkles className="text-indigo-600 dark:text-indigo-400 w-4 h-4" />
                    )}
                    AI Insights
                  </button>
                </div>

                {/* AI Insight Banner */}
                {aiInsight && (
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200"
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-white/20 rounded-xl backdrop-blur-md">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg mb-1">Smart Analysis</h3>
                        <p className="text-indigo-50 leading-relaxed">{aiInsight}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard 
                    title="Total Tasks" 
                    value={tasks.length} 
                    icon={<CheckSquare className="text-blue-600 dark:text-blue-400" />} 
                    trend="+12%"
                    color="blue"
                  />
                  <StatCard 
                    title="In Progress" 
                    value={tasks.filter(t => t.status === 'in-progress').length} 
                    icon={<Clock className="text-amber-600 dark:text-amber-400" />} 
                    trend="+5%"
                    color="amber"
                  />
                  <StatCard 
                    title="Completed" 
                    value={tasks.filter(t => t.status === 'done').length} 
                    icon={<TrendingUp className="text-emerald-600 dark:text-emerald-400" />} 
                    trend="+18%"
                    color="emerald"
                  />
                  <StatCard 
                    title="High Priority" 
                    value={tasks.filter(t => t.priority === 'high').length} 
                    icon={<AlertCircle className="text-rose-600 dark:text-rose-400" />} 
                    trend="-2%"
                    color="rose"
                  />
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-[var(--card)] p-6 rounded-3xl border border-[var(--border)] shadow-sm">
                    <h3 className="font-bold text-lg mb-6 text-slate-900 dark:text-slate-100">Task Distribution</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "#1e293b" : "#e2e8f0"} />
                          <XAxis 
                            dataKey="status" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 12, fill: darkMode ? '#94a3b8' : '#475569' }}
                            textAnchor="middle"
                          />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: darkMode ? '#94a3b8' : '#475569' }} />
                          <Tooltip 
                            cursor={{ fill: darkMode ? '#1e293b' : '#f8fafc' }}
                            contentStyle={{ 
                              backgroundColor: darkMode ? '#0f172a' : '#ffffff',
                              borderRadius: '16px', 
                              border: darkMode ? '1px solid #1e293b' : '1px solid #e2e8f0', 
                              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                              padding: '12px'
                            }}
                            itemStyle={{
                              color: darkMode ? '#f1f5f9' : '#0f172a',
                              fontSize: '12px',
                              fontWeight: '600',
                              textTransform: 'capitalize'
                            }}
                            labelStyle={{
                              color: darkMode ? '#94a3b8' : '#64748b',
                              fontSize: '11px',
                              marginBottom: '4px',
                              fontWeight: 'bold',
                              textTransform: 'uppercase'
                            }}
                          />
                          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                            {Array.isArray(stats) && stats.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.status === 'done' ? '#10B981' : entry.status === 'in-progress' ? '#F59E0B' : '#6366F1'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-[var(--card)] p-6 rounded-3xl border border-[var(--border)] shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">Recent Activity</h3>
                      <button onClick={() => setActiveTab('tasks')} className="text-indigo-600 dark:text-indigo-400 text-sm font-bold hover:underline">View All</button>
                    </div>
                    <div className="space-y-4">
                      {(Array.isArray(tasks) ? tasks : []).slice(-4).reverse().map(task => (
                        <div key={task.id} className="flex items-center gap-4 p-3 hover:bg-[var(--secondary)] rounded-2xl transition-colors group">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                            task.status === 'done' ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400" : "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400"
                          )}>
                            {task.status === 'done' ? <CheckSquare size={18} /> : <Clock size={18} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{task.title}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Updated recently</p>
                          </div>
                          <ChevronRight className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors" size={16} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'tasks' && (
              <motion.div 
                key="tasks"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full flex flex-col"
              >
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">Task Board</h1>
                    <p className="text-gray-500 mt-1">Manage and track your team's progress.</p>
                  </div>
                  <div className="flex gap-3">
                    <select 
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-sm font-semibold hover:bg-[var(--secondary)] transition-all shadow-sm focus:outline-none"
                    >
                      <option value="all">All Status</option>
                      <option value="todo">To Do</option>
                      <option value="in-progress">In Progress</option>
                      <option value="done">Completed</option>
                    </select>
                    <button 
                      onClick={() => setIsTaskModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-500/20"
                    >
                      <Plus size={18} />
                      New Task
                    </button>
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 min-h-0">
                  <TaskColumn 
                    title="To Do" 
                    tasks={filteredTasks.filter(t => t.status === 'todo')} 
                    onStatusChange={updateTaskStatus}
                    onDelete={deleteTask}
                    onAdd={() => openTaskModal('todo')}
                  />
                  <TaskColumn 
                    title="In Progress" 
                    tasks={filteredTasks.filter(t => t.status === 'in-progress')} 
                    onStatusChange={updateTaskStatus}
                    onDelete={deleteTask}
                    onAdd={() => openTaskModal('in-progress')}
                  />
                  <TaskColumn 
                    title="Completed" 
                    tasks={filteredTasks.filter(t => t.status === 'done')} 
                    onStatusChange={updateTaskStatus}
                    onDelete={deleteTask}
                    onAdd={() => openTaskModal('done')}
                  />
                </div>
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col bg-[var(--card)] rounded-3xl border border-[var(--border)] shadow-sm overflow-hidden transition-colors duration-300"
              >
                <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-950/50 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                      <MessageSquare size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100">Team Chat</h3>
                      <p className="text-xs text-emerald-500 font-bold uppercase tracking-wider">4 members online</p>
                    </div>
                  </div>
                  {user.role === 'admin' && (
                    <button 
                      onClick={clearAllMessages}
                      className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-all"
                    >
                      <Trash2 size={14} />
                      Clear All
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                  {Array.isArray(messages) && messages.map((msg) => (
                    <div key={msg.id} className={cn(
                      "flex gap-3 max-w-[80%] group",
                      msg.user_name === user.username ? "ml-auto flex-row-reverse" : "flex-row"
                    )}>
                      <img 
                        src={(msg as any).avatar || `https://picsum.photos/seed/${msg.user_name}/100/100`} 
                        className="w-8 h-8 rounded-full shrink-0 border border-[var(--border)] object-cover" 
                        alt="Avatar"
                        referrerPolicy="no-referrer"
                      />
                      <div className={cn(
                        "flex flex-col",
                        msg.user_name === user.username ? "items-end" : "items-start"
                      )}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-black text-slate-600 dark:text-slate-400">{msg.user_name}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {user.role === 'admin' && (
                            <button 
                              onClick={() => deleteMessage(msg.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 transition-all"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                        <div className={cn(
                          "px-4 py-2 rounded-2xl text-sm font-medium leading-relaxed",
                          msg.user_name === user.username 
                            ? "bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-500/20" 
                            : "bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-tl-none"
                        )}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={sendMessage} className="p-4 border-t border-[var(--border)] flex gap-3">
                  <input 
                    type="text" 
                    placeholder="Type a message..." 
                    className="flex-1 px-4 py-2 bg-[var(--background)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                  />
                  <button className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-500/20">
                    <Send size={20} />
                  </button>
                </form>
              </motion.div>
            )}

            {activeTab === 'admin' && user?.role === 'admin' && (
              <motion.div 
                key="admin"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">Admin Control</h1>
                    <p className="text-gray-500 mt-1">Manage users, roles, and system access.</p>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingUser(null);
                      setUserForm({ username: '', password: '', role: 'user' });
                      setIsUserModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all"
                  >
                    <Plus size={20} />
                    <span>Add User</span>
                  </button>
                </div>

                <div className="bg-[var(--card)] rounded-3xl border border-[var(--border)] overflow-hidden transition-colors duration-300">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-[var(--border)]">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">User</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Role</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Joined</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {Array.isArray(adminUsers) && adminUsers.map(u => (
                        <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <img src={`https://picsum.photos/seed/${u.username}/100/100`} className="w-8 h-8 rounded-full border border-[var(--border)]" alt="" />
                              <span className="font-bold text-sm">{u.username}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider",
                              u.role === 'admin' ? "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                            )}>
                              {u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => {
                                  setEditingUser(u);
                                  setUserForm({ username: u.username, password: '', role: u.role });
                                  setIsUserModalOpen(true);
                                }}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-xl transition-all"
                              >
                                <UserCog size={18} />
                              </button>
                              <button 
                                onClick={() => deleteAdminUser(u.id)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-all"
                                disabled={u.id === user.id}
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && user && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                  <p className="text-gray-500 mt-1">Manage your account and workspace preferences.</p>
                </div>

                <div className="bg-[var(--card)] rounded-3xl border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden transition-colors duration-300">
                  <SettingsSection 
                    title="Profile Information" 
                    icon={<User size={20} className="text-indigo-600 dark:text-indigo-400" />}
                  >
                    {isProfileEditing ? (
                      <form onSubmit={handleUpdateProfile} className="p-4 space-y-4">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="relative group">
                            <img 
                              src={profileForm.avatar || `https://picsum.photos/seed/${user.username}/100/100`} 
                              className="w-20 h-20 rounded-full border-2 border-indigo-500 object-cover" 
                              alt="Avatar" 
                            />
                            <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                              <Plus className="text-white" size={24} />
                              <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      const img = new Image();
                                      img.onload = () => {
                                        const canvas = document.createElement('canvas');
                                        const MAX_WIDTH = 150;
                                        const MAX_HEIGHT = 150;
                                        let width = img.width;
                                        let height = img.height;

                                        if (width > height) {
                                          if (width > MAX_WIDTH) {
                                            height *= MAX_WIDTH / width;
                                            width = MAX_WIDTH;
                                          }
                                        } else {
                                          if (height > MAX_HEIGHT) {
                                            width *= MAX_HEIGHT / height;
                                            height = MAX_HEIGHT;
                                          }
                                        }
                                        canvas.width = width;
                                        canvas.height = height;
                                        const ctx = canvas.getContext('2d');
                                        ctx?.drawImage(img, 0, 0, width, height);
                                        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                                        setProfileForm({ ...profileForm, avatar: dataUrl });
                                      };
                                      img.src = event.target?.result as string;
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          </div>
                          <div>
                            <p className="text-sm font-bold">Change Avatar</p>
                            <p className="text-xs text-slate-500">JPG or PNG, max 150x150px</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Username</label>
                            <input 
                              type="text" 
                              className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                              value={profileForm.username}
                              onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">New Password (Optional)</label>
                            <input 
                              type="password" 
                              className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                              placeholder="Leave blank to keep current"
                              value={profileForm.password}
                              onChange={(e) => setProfileForm({ ...profileForm, password: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">Save Changes</button>
                          <button type="button" onClick={() => setIsProfileEditing(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all">Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center gap-6 p-4">
                        <img src={user.avatar || `https://picsum.photos/seed/${user.username}/100/100`} className="w-16 h-16 rounded-full border-2 border-[var(--border)] object-cover" alt="Profile" />
                        <div className="flex-1">
                          <p className="font-bold text-lg">{user.username}</p>
                          <p className="text-sm text-gray-500">{(user.username || '').toLowerCase()}@nexus.ai</p>
                        </div>
                        <button onClick={() => setIsProfileEditing(true)} className="px-4 py-2 border border-[var(--border)] rounded-xl text-sm font-semibold hover:bg-[var(--secondary)] transition-all">Edit</button>
                      </div>
                    )}
                  </SettingsSection>

                  <SettingsSection 
                    title="Appearance" 
                    icon={darkMode ? <Moon size={20} className="text-indigo-400" /> : <Sun size={20} className="text-indigo-600" />}
                  >
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold">Dark Mode</p>
                        <p className="text-xs text-gray-500">Switch between light and dark themes.</p>
                      </div>
                      <button 
                        onClick={toggleDarkMode}
                        className={cn(
                          "w-12 h-6 rounded-full relative transition-colors duration-300",
                          darkMode ? "bg-indigo-600" : "bg-gray-200"
                        )}
                      >
                        <motion.div 
                          animate={{ x: darkMode ? 26 : 2 }}
                          className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm"
                        />
                      </button>
                    </div>
                  </SettingsSection>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Admin User Modal */}
      <AnimatePresence>
        {isUserModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsUserModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[var(--card)] rounded-3xl shadow-2xl overflow-hidden border border-[var(--border)]"
            >
              <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="text-xl font-bold">{editingUser ? 'Edit User' : 'Add New User'}</h3>
                <button onClick={() => setIsUserModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleAdminUserAction} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Username</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-4 py-2 bg-[var(--background)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={userForm.username}
                    onChange={(e) => setUserForm({...userForm, username: e.target.value})}
                    disabled={!!editingUser}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{editingUser ? 'New Password (Optional)' : 'Password'}</label>
                  <input 
                    type="password" 
                    required={!editingUser}
                    className="w-full px-4 py-2 bg-[var(--background)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={userForm.password}
                    onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Role</label>
                  <select 
                    className="w-full px-4 py-2 bg-[var(--background)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={userForm.role}
                    onChange={(e) => setUserForm({...userForm, role: e.target.value})}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all">
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Task Modal */}
      <AnimatePresence>
        {isTaskModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTaskModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[var(--card)] rounded-3xl shadow-2xl overflow-hidden border border-[var(--border)]"
            >
              <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="text-xl font-bold">Create New Task</h3>
                <button onClick={() => setIsTaskModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={createTask} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">Task Title</label>
                  <input 
                    autoFocus
                    type="text" 
                    className="w-full px-4 py-2 bg-[var(--background)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-white"
                    placeholder="e.g. Implement user authentication"
                    value={newTask.title}
                    onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">Priority</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['low', 'medium', 'high'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNewTask({...newTask, priority: p})}
                        className={cn(
                          "py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                          newTask.priority === p 
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20" 
                            : "bg-[var(--secondary)] text-slate-500 dark:text-gray-400 hover:bg-[var(--accent)]"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20">
                  Create Task
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group relative",
        active 
          ? "bg-indigo-600 dark:bg-indigo-600 text-white font-black shadow-lg shadow-indigo-500/30" 
          : "text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
      )}
    >
      <span className={cn(
        "transition-transform duration-300 group-hover:scale-110",
        active ? "text-white" : "text-slate-400 dark:text-slate-500 group-hover:text-indigo-500"
      )}>
        {icon}
      </span>
      <span className="text-sm tracking-wide">{label}</span>
      {active && (
        <motion.div 
          layoutId="active-pill"
          className="absolute left-0 w-1.5 h-6 bg-white rounded-r-full"
        />
      )}
    </button>
  );
}

function StatCard({ title, value, icon, trend, color }: { title: string, value: number | string, icon: React.ReactNode, trend: string, color: string }) {
  const isPositive = trend.startsWith('+');
  
  return (
    <div className="bg-[var(--card)] p-6 rounded-3xl border border-[var(--border)] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
      <div className="flex items-center justify-between mb-4">
        <div className={cn(
          "p-3 rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3", 
          `bg-${color}-100 dark:bg-${color}-950/30`
        )}>
          {icon}
        </div>
        <span className={cn(
          "text-xs font-black px-2.5 py-1 rounded-full",
          isPositive ? "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400" : "bg-rose-100 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400"
        )}>
          {trend}
        </span>
      </div>
      <p className="text-slate-500 dark:text-slate-400 text-sm font-bold tracking-wide">{title}</p>
      <h4 className="text-3xl font-black mt-1 tracking-tight text-slate-900 dark:text-white">{value}</h4>
    </div>
  );
}

function TaskColumn({ title, tasks, onStatusChange, onDelete, onAdd }: { title: string, tasks: Task[], onStatusChange: (id: number, status: Task['status']) => void, onDelete: (id: number) => void, onAdd: () => void }) {
  return (
    <div className="flex flex-col h-full bg-slate-200/40 dark:bg-slate-900/40 rounded-3xl p-4 border border-slate-300/40 dark:border-slate-800/60 transition-colors duration-300">
      <div className="flex items-center justify-between mb-6 px-2">
        <div className="flex items-center gap-3">
          <h3 className="font-black text-sm text-slate-700 dark:text-slate-400 uppercase tracking-widest">{title}</h3>
          <span className="bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 text-xs font-black px-2.5 py-0.5 rounded-full shadow-sm border border-slate-200 dark:border-slate-700">
            {tasks.length}
          </span>
        </div>
        <button onClick={onAdd} className="text-slate-500 hover:text-indigo-600 transition-colors">
          <Plus size={18} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} onStatusChange={onStatusChange} onDelete={onDelete} />
          ))}
        </AnimatePresence>
        {tasks.length === 0 && (
          <div className="h-32 border-2 border-dashed border-[var(--border)] rounded-2xl flex items-center justify-center text-gray-400 text-sm italic">
            No tasks in this stage
          </div>
        )}
      </div>
    </div>
  );
}

const TaskCard: React.FC<{ task: Task, onStatusChange: (id: number, status: Task['status']) => void, onDelete: (id: number) => void }> = ({ task, onStatusChange, onDelete }) => {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
      whileHover={{ y: -4 }}
      className="bg-[var(--card)] p-5 rounded-2xl border border-[var(--border)] shadow-sm hover:shadow-xl transition-all cursor-grab active:cursor-grabbing group relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="flex items-start justify-between mb-4">
        <span className={cn(
          "text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider shadow-sm",
          task.priority === 'high' ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400" : 
          task.priority === 'medium' ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400" : "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
        )}>
          {task.priority}
        </span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
          <button 
            onClick={() => onDelete(task.id)}
            className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg text-rose-400 transition-colors"
            title="Delete Task"
          >
            <Trash2 size={14} />
          </button>
          {task.status !== 'todo' && (
            <button 
              onClick={() => onStatusChange(task.id, 'todo')}
              className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg text-indigo-400 transition-colors"
              title="Move to Todo"
            >
              <ChevronRight size={14} className="rotate-180" />
            </button>
          )}
          {task.status !== 'in-progress' && (
            <button 
              onClick={() => onStatusChange(task.id, 'in-progress')}
              className="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg text-amber-500 transition-colors"
              title="Move to In Progress"
            >
              <Clock size={14} />
            </button>
          )}
          {task.status !== 'done' && (
            <button 
              onClick={() => onStatusChange(task.id, 'done')}
              className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg text-emerald-500 transition-colors"
              title="Move to Done"
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
      
      <h5 className="text-sm font-bold mb-4 leading-relaxed text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{task.title}</h5>
      
      <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
        <div className="flex -space-x-2">
          <img 
            src={`https://picsum.photos/seed/${task.id}/40/40`} 
            className="w-7 h-7 rounded-full border-2 border-[var(--card)] shadow-sm" 
            alt="Assignee"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
          <Clock size={12} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Oct 24</span>
        </div>
      </div>
    </motion.div>
  );
}

function SettingsSection({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <h3 className="font-bold text-lg">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Auth({ onLogin }: { onLogin: (data: any) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      if (isLogin) {
        onLogin(data);
      } else {
        setIsLogin(true);
        setError('Registration successful! Please login.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
      >
        <div className="p-8 bg-indigo-600">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-md">
            <Sparkles className="text-white w-6 h-6" />
          </div>
          <h2 className="text-2xl font-black text-white">Nexus AI</h2>
          <p className="text-indigo-100">Workspace for modern teams</p>
        </div>

        <div className="p-8">
          <div className="flex gap-4 mb-8">
            <button 
              onClick={() => setIsLogin(true)}
              className={cn(
                "flex-1 py-2 rounded-xl text-sm font-bold transition-all",
                isLogin ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
              )}
            >
              Login
            </button>
            <button 
              onClick={() => setIsLogin(false)}
              className={cn(
                "flex-1 py-2 rounded-xl text-sm font-bold transition-all",
                !isLogin ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
              )}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className={cn(
                "p-3 rounded-xl text-xs font-bold",
                error.includes('successful') ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              )}>
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                  type="text" 
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Password</label>
              <div className="relative">
                <LogIn className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                  type="password" 
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <button 
              disabled={loading}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
            >
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (isLogin ? 'Sign In' : 'Create Account')}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
