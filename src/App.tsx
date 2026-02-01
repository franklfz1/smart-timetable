import React, { useState, useEffect, useRef } from 'react';
import { Plus, Calendar, Clock, GraduationCap, User, X, Trash2, Settings, Download, Save, Edit2, Tag, Upload, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import html2canvas from 'html2canvas';
import { supabase } from './supabaseClient';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Course {
  id: string;
  name: string;
  day: number; // 0-6 (Mon-Sun)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  teacher: string;
  grade: string;
}

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const DEFAULT_TEACHERS = ['张老师', '王老师', '李老师', '赵老师', '陈老师', '其他'];

const TEACHER_COLORS_MAP: Record<number, string> = {
  0: 'bg-blue-100 text-blue-900 border-blue-300',
  1: 'bg-green-100 text-green-900 border-green-300',
  2: 'bg-purple-100 text-purple-900 border-purple-300',
  3: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  4: 'bg-pink-100 text-pink-900 border-pink-300',
  5: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  6: 'bg-slate-100 text-slate-900 border-slate-300',
  7: 'bg-orange-100 text-orange-900 border-orange-300',
  8: 'bg-cyan-100 text-cyan-900 border-cyan-300',
  9: 'bg-rose-100 text-rose-900 border-rose-300',
};

const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'
];

const App: React.FC = () => {
  const timetableRef = useRef<HTMLDivElement>(null);
  const [currentDay, setCurrentDay] = useState<number>(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
  const [orgName, setOrgName] = useState('智能教育中心');
  const [teachers, setTeachers] = useState<string[]>(DEFAULT_TEACHERS);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'success'>('idle');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const slotHeight = isExporting ? 46 : 80;

  const [newCourse, setNewCourse] = useState<Partial<Course>>({
    name: '',
    day: 0,
    startTime: '08:00',
    endTime: '09:00',
    teacher: teachers[0],
    grade: '',
  });

  // 初始化从 Supabase 获取数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('timetable_sync')
          .select('data')
          .eq('id', 'global')
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            // 数据不存在，尝试创建初始数据
            await supabase.from('timetable_sync').insert([{ id: 'global', data: { orgName, teachers, courses } }]);
          } else {
            console.error('Fetch error:', error);
            setSyncStatus('error');
          }
        } else if (data) {
          setOrgName(data.data.orgName);
          setTeachers(data.data.teachers);
          setCourses(data.data.courses);
          setSyncStatus('success');
        }
      } catch (err) {
        console.error('Sync failed:', err);
        setSyncStatus('error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // 数据变更时自动同步到 Supabase (带防抖)
  useEffect(() => {
    if (isLoading) return;

    const timer = setTimeout(async () => {
      setSyncStatus('syncing');
      try {
        const { error } = await supabase
          .from('timetable_sync')
          .upsert({ id: 'global', data: { orgName, teachers, courses } });

        if (error) throw error;
        setSyncStatus('success');
      } catch (err) {
        console.error('Auto sync failed:', err);
        setSyncStatus('error');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [orgName, teachers, courses, isLoading]);

  const handleSaveCourse = () => {
    if (newCourse.name && newCourse.startTime && newCourse.endTime) {
      if (editingCourseId) {
        setCourses(courses.map(c => c.id === editingCourseId ? { ...c, ...newCourse } as Course : c));
      } else {
        const course: Course = {
          id: Math.random().toString(36).substr(2, 9),
          name: newCourse.name!,
          day: newCourse.day!,
          startTime: newCourse.startTime!,
          endTime: newCourse.endTime!,
          teacher: newCourse.teacher || teachers[0],
          grade: newCourse.grade || '全级',
        };
        setCourses([...courses, course]);
      }
      
      setIsModalOpen(false);
      setEditingCourseId(null);
      // 不再重置 newCourse，保留填写信息以方便下次快速添加
    }
  };

  const openEditModal = (course: Course) => {
    setNewCourse(course);
    setEditingCourseId(course.id);
    setIsModalOpen(true);
  };

  const removeCourse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除这节课程吗？')) {
      setCourses(courses.filter(c => c.id !== id));
    }
  };

  const exportAsImage = async () => {
    if (timetableRef.current) {
      setIsExporting(true);
      const element = timetableRef.current;
      
      // Force styles immediately
      element.style.width = '1123px';
      element.style.height = '794px';
      element.style.padding = '20px';
      element.classList.add('exporting');
      
      // Increased delay and multiple frames to ensure browser layout is ready for canvas
      await new Promise(resolve => setTimeout(resolve, 500));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      try {
        const canvas = await html2canvas(element, {
          scale: 2.5, // Slightly lower scale to improve font rendering stability in some canvas engines
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          width: 1123,
          height: 794,
          onclone: (clonedDoc) => {
            const el = clonedDoc.querySelector('.exporting') as HTMLElement;
            if (el) {
              el.style.width = '1123px';
              el.style.height = '794px';
            }
          }
        });
        
        const image = canvas.toDataURL('image/png', 1.0);
        const link = document.createElement('a');
        link.href = image;
        link.download = `${orgName}-课程表.png`;
        link.click();
      } catch (err) {
        console.error('Export failed:', err);
        alert('导出失败，请重试');
      } finally {
        element.style.width = '';
        element.style.height = '';
        element.style.padding = '';
        element.classList.remove('exporting');
        setIsExporting(false);
      }
    }
  };

  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [teacherFilter, setTeacherFilter] = useState<string>('all');

  const handleBackup = () => {
    const data = {
      courses,
      teachers,
      orgName,
      version: '1.0'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${orgName}-课表备份-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.courses && data.teachers && data.orgName) {
          if (confirm('导入备份将覆盖当前所有数据，是否继续？')) {
            setCourses(data.courses);
            setTeachers(data.teachers);
            setOrgName(data.orgName);
            alert('数据恢复成功！');
          }
        } else {
          alert('无效的备份文件格式');
        }
      } catch (err) {
        alert('解析文件失败');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  // 获取课程布局信息（包含基于老师排序的固定位置）
  const getCoursesWithLayout = (dayIndex: number) => {
    let dayCourses = courses.filter(c => c.day === dayIndex);
    
    // 应用筛选
    if (gradeFilter !== 'all') {
      dayCourses = dayCourses.filter(c => c.grade === gradeFilter);
    }
    if (teacherFilter !== 'all') {
      dayCourses = dayCourses.filter(c => c.teacher === teacherFilter);
    }

    if (dayCourses.length === 0) return [];

    // 1. 构建重叠图
    const adj = dayCourses.map(() => [] as number[]);
    for (let i = 0; i < dayCourses.length; i++) {
      for (let j = i + 1; j < dayCourses.length; j++) {
        const a = dayCourses[i];
        const b = dayCourses[j];
        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          adj[i].push(j);
          adj[j].push(i);
        }
      }
    }

    // 2. 查找连通分量（重叠簇）
    const visited = new Set<number>();
    const results: (Course & { col: number; total: number })[] = [];

    for (let i = 0; i < dayCourses.length; i++) {
      if (!visited.has(i)) {
        const clusterIndices: number[] = [];
        const stack = [i];
        visited.add(i);
        while (stack.length > 0) {
          const curr = stack.pop()!;
          clusterIndices.push(curr);
          for (const neighbor of adj[curr]) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              stack.push(neighbor);
            }
          }
        }

        // 3. 处理该簇：按老师在 settings 中的顺序分配列
        const clusterCourses = clusterIndices.map(idx => dayCourses[idx]);
        const uniqueTeachersInCluster = Array.from(new Set(clusterCourses.map(c => c.teacher)))
          .sort((a, b) => teachers.indexOf(a) - teachers.indexOf(b));
        
        const total = uniqueTeachersInCluster.length;
        clusterIndices.forEach(idx => {
          const course = dayCourses[idx];
          results.push({
            ...course,
            col: uniqueTeachersInCluster.indexOf(course.teacher),
            total
          });
        });
      }
    }

    return results;
  };

  const getDayWidths = () => {
    const maxColsPerDay = DAYS.map((_, i) => {
      const layout = getCoursesWithLayout(i);
      return layout.length > 0 ? Math.max(...layout.map(c => c.total)) : 1;
    });
    const totalWeight = maxColsPerDay.reduce((a, b) => a + b, 0);
    return maxColsPerDay.map(cols => (cols / totalWeight) * 100);
  };

  const dayWidths = getDayWidths();

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      {isLoading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-center">
          <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mb-4" />
          <p className="text-slate-600 font-bold">云端数据加载中...</p>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 no-export">
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-8 h-8 text-blue-600" />
                {orgName}
              </h1>
              <div className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold transition-all",
                syncStatus === 'syncing' ? "bg-blue-50 text-blue-600" :
                syncStatus === 'success' ? "bg-green-50 text-green-600" :
                syncStatus === 'error' ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400"
              )}>
                {syncStatus === 'syncing' && <RefreshCw className="w-3 h-3 animate-spin" />}
                {syncStatus === 'success' && <Cloud className="w-3 h-3" />}
                {syncStatus === 'error' && <CloudOff className="w-3 h-3" />}
                {syncStatus === 'idle' && <Cloud className="w-3 h-3" />}
                <span>
                  {syncStatus === 'syncing' ? '正在同步云端...' : 
                   syncStatus === 'success' ? '云端已同步' : 
                   syncStatus === 'error' ? '同步失败 (请检查网络)' : '就绪'}
                </span>
              </div>
            </div>
            <p className="text-slate-500 mt-1">管理排课信息，点击卡片即可编辑</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 no-export">
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <div className="flex items-center gap-1 px-2 text-slate-500">
                <Tag className="w-4 h-4" />
                <span className="text-xs font-bold">筛选:</span>
              </div>
              <select 
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
                className="text-xs font-bold bg-white border-none rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">所有老师</option>
                {teachers.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select 
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="text-xs font-bold bg-white border-none rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">所有年级</option>
                {Array.from(new Set(courses.map(c => c.grade))).filter(Boolean).sort().map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div className="h-6 w-px bg-slate-200"></div>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl font-medium transition-all border border-slate-200 active:scale-95"
            >
              <Settings className="w-5 h-5" />
              机构设置
            </button>
            <button
              onClick={() => {
                if (confirm('确定要清空所有课程吗？')) {
                  setCourses([]);
                }
              }}
              className="flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl font-medium transition-all border border-slate-200 active:scale-95"
            >
              <Trash2 className="w-5 h-5" />
              清空
            </button>
            <button
              onClick={exportAsImage}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-green-200 active:scale-95"
            >
              <Download className="w-5 h-5" />
              导出图片
            </button>
            <button
              onClick={() => {
                setEditingCourseId(null);
                setIsModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-blue-200 active:scale-95"
            >
              <Plus className="w-5 h-5" />
              添加课程
            </button>
          </div>
        </div>

        {/* Timetable Export Area */}
        <div ref={timetableRef} className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 p-6 exporting:p-4">
          <div className={cn("text-center hidden show-on-export block", isExporting ? "mb-3" : "mb-6")}>
             <h2 className={cn("font-bold text-slate-800", isExporting ? "text-xl" : "text-2xl")}>{orgName} - 课程表</h2>
             <p className="text-slate-500 text-xs mt-0.5">生成日期: {new Date().toLocaleDateString()}</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden timetable-container">
            <div className="grid grid-cols-[80px_1fr] border-b border-slate-200 bg-slate-50/50">
              <div className="border-r border-slate-200 flex items-center justify-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">时间</div>
              <div className="flex">
                {DAYS.map((day, index) => (
                  <div 
                    key={day} 
                    className={cn(
                      "text-center font-bold border-r border-slate-200 last:border-r-0 transition-colors",
                      isExporting ? "py-2" : "py-4",
                      currentDay === index ? "text-blue-600 bg-blue-50/50" : "text-slate-700"
                    )}
                    style={{ width: `${dayWidths[index]}%` }}
                  >
                    <span className={isExporting ? "text-base" : "text-lg"}>{day}</span>
                    {currentDay === index && <div className="text-[10px] font-normal text-blue-400 mt-0.5 no-export">今天</div>}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[80px_1fr] relative">
              {/* Time Axis */}
              <div className="bg-slate-50/30 border-r border-slate-200">
                {TIME_SLOTS.map((time) => (
                  <div 
                    key={time} 
                    className="border-b border-slate-100 flex items-start justify-center pt-2 text-xs text-slate-400 font-medium"
                    style={{ height: `${slotHeight}px` }}
                  >
                    {time}
                  </div>
                ))}
              </div>

              {/* Courses Grid */}
              <div 
                className="flex relative"
                style={{ height: `${slotHeight * 14}px` }}
              >
                {/* Background Lines */}
                <div 
                  className="absolute inset-0 flex pointer-events-none"
                >
                  {dayWidths.map((width, i) => (
                    <div 
                      key={`col-bg-${i}`} 
                      className="h-full border-r border-slate-100 last:border-r-0 relative"
                      style={{ width: `${width}%` }}
                    >
                      {TIME_SLOTS.map((time) => (
                        <div key={`line-${i}-${time}`} className="border-b border-slate-100 w-full" style={{ height: `${slotHeight}px` }}></div>
                      ))}
                    </div>
                  ))}
                </div>

                {DAYS.map((_, dayIndex) => {
                  const dayLayout = getCoursesWithLayout(dayIndex);
                  return (
                    <div 
                      key={dayIndex} 
                      className={cn(
                        "relative transition-colors",
                        currentDay === dayIndex ? "bg-blue-50/5" : "bg-transparent"
                      )}
                      style={{ width: `${dayWidths[dayIndex]}%` }}
                    >
                      {dayLayout.map((course) => {
                        const startMinutes = parseInt(course.startTime.split(':')[0]) * 60 + parseInt(course.startTime.split(':')[1]);
                        const endMinutes = parseInt(course.endTime.split(':')[0]) * 60 + parseInt(course.endTime.split(':')[1]);
                        const baseMinutes = 8 * 60;
                        const top = ((startMinutes - baseMinutes) / 60) * slotHeight;
                        const height = ((endMinutes - startMinutes) / 60) * slotHeight;

                        const teacherIdx = teachers.indexOf(course.teacher);
                         const dynamicColor = TEACHER_COLORS_MAP[teacherIdx % 10] || TEACHER_COLORS_MAP[6];

                         return (
                           <div
                             key={course.id}
                             onClick={() => openEditModal(course)}
                             className={cn(
                               "absolute rounded-xl border shadow-sm transition-all hover:shadow-xl hover:z-20 cursor-pointer group overflow-hidden",
                               isExporting ? "p-1 border-opacity-50" : "p-2.5 border-2",
                               dynamicColor
                             )}
                            style={{ 
                              top: `${top}px`, 
                              height: `${height}px`,
                              left: `${(course.col / course.total) * 100}%`,
                              width: `${(1 / course.total) * 100}%` 
                            }}
                          >
                            <button
                              onClick={(e) => removeCourse(course.id, e)}
                              className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-30 no-export"
                            >
                              <X className="w-3 h-3" />
                            </button>
                            
                            <div className="flex flex-col h-full justify-start gap-0.5 overflow-hidden">
                              <div className={cn(
                                "font-black truncate leading-none",
                                isExporting ? "text-[10px] mb-0.5" : "text-sm mb-1"
                              )}>
                                {course.name}
                              </div>
                              <div className={cn(
                                "flex items-center gap-0.5 font-bold opacity-80 shrink-0 leading-none",
                                isExporting ? "text-[8px]" : "text-[11px] mb-1.5"
                              )}>
                                <Clock className={isExporting ? "w-2 h-2" : "w-3 h-3"} />
                                {course.startTime}-{course.endTime}
                              </div>
                              
                              <div className={cn(
                                "flex flex-wrap gap-0.5 mt-0.5 shrink-0",
                                (isExporting && height < 50) ? "hidden" : "flex",
                                isExporting ? "" : "gap-1.5"
                              )}>
                                <span className={cn(
                                  "rounded bg-white/60 font-bold border border-black/5 flex items-center gap-0.5",
                                  isExporting ? "px-0.5 py-0 text-[7px]" : "px-2 py-0.5 text-[10px]"
                                )}>
                                  <User className={isExporting ? "w-1.5 h-1.5" : "w-2.5 h-2.5"} />
                                  {course.teacher}
                                </span>
                                <span className={cn(
                                  "rounded bg-white/60 font-bold border border-black/5 flex items-center gap-0.5",
                                  isExporting ? "px-0.5 py-0 text-[7px]" : "px-2 py-0.5 text-[10px]"
                                )}>
                                  <GraduationCap className={isExporting ? "w-1.5 h-1.5" : "w-2.5 h-2.5"} />
                                  {course.grade}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-400" />
                机构设置
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">机构名称</label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="输入您的机构名称"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">老师列表 (逗号分隔)</label>
                <textarea
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-32 resize-none"
                  value={teachers.join(', ')}
                  onChange={(e) => setTeachers(e.target.value.split(',').map(s => s.trim()).filter(s => s !== ''))}
                  placeholder="例如：张老师, 王老师, 李老师"
                />
                <p className="mt-2 text-xs text-slate-400 italic">注：修改老师名称可能会影响课程配色</p>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <label className="block text-sm font-black text-slate-700 mb-3">数据备份与恢复</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleBackup}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold border border-slate-200 hover:bg-slate-200 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    导出备份 (.json)
                  </button>
                  <label className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold border border-slate-200 hover:bg-slate-200 transition-all cursor-pointer">
                    <Upload className="w-4 h-4" />
                    导入还原
                    <input type="file" accept=".json" onChange={handleRestore} className="hidden" />
                  </label>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 italic">提示：导入备份将覆盖当前浏览器中的所有设置和课程数据。</p>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-full px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Course Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                {editingCourseId ? <Edit2 className="w-5 h-5 text-blue-500" /> : <Plus className="w-5 h-5 text-blue-500" />}
                {editingCourseId ? '修改课程' : '新增课程'}
              </h2>
              <button onClick={() => { setIsModalOpen(false); setEditingCourseId(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">课程名称</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="例如：钢琴初级班"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                    value={newCourse.name}
                    onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                  />
                  <Tag className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">上课日期</label>
                  <select
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newCourse.day}
                    onChange={(e) => setNewCourse({ ...newCourse, day: parseInt(e.target.value) })}
                  >
                    {DAYS.map((day, i) => (
                      <option key={day} value={i}>{day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">任课老师</label>
                  <select
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newCourse.teacher}
                    onChange={(e) => setNewCourse({ ...newCourse, teacher: e.target.value })}
                  >
                    {teachers.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">开始时间</label>
                  <input
                    type="time"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newCourse.startTime}
                    onChange={(e) => setNewCourse({ ...newCourse, startTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">结束时间</label>
                  <input
                    type="time"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newCourse.endTime}
                    onChange={(e) => setNewCourse({ ...newCourse, endTime: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">学员年级</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="例如：一年级 A班"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newCourse.grade}
                    onChange={(e) => setNewCourse({ ...newCourse, grade: e.target.value })}
                  />
                  <GraduationCap className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => { setIsModalOpen(false); setEditingCourseId(null); }}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveCourse}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                {editingCourseId ? '更新课程' : '保存课程'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-export { display: none !important; }
        }
        .show-on-export { display: none; }
        .exporting .show-on-export { display: block !important; }
        .exporting .no-export { display: none !important; }
        .exporting { border: none !important; box-shadow: none !important; border-radius: 0 !important; background: white !important; }
        .exporting .bg-slate-50, .exporting .bg-slate-50\/50, .exporting .bg-slate-50\/30 { background-color: #f8fafc !important; }
        .exporting .bg-white { background-color: white !important; }
        .exporting .timetable-container { border-radius: 0 !important; border: 1px solid #e2e8f0 !important; }
      `}} />
    </div>
  );
};

export default App;
