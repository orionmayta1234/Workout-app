import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, query, onSnapshot, updateDoc, deleteDoc, serverTimestamp, where, getDocs } from 'firebase/firestore';
import { PlusCircle, Play, Pause, StopCircle, Edit3, Trash2, Save, XCircle, CheckCircle, ChevronDown, ChevronUp, Clock, Dumbbell, Weight, Repeat, ListChecks, User, Settings, Home, BarChart2, Calendar, Edit } from 'lucide-react';

// --- Firebase Configuration ---
// NOTE: __firebase_config, __app_id, and __initial_auth_token are provided by the environment
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Helper Functions ---
const generateId = () => Math.random().toString(36).substr(2, 9);

// --- Main App Component ---
function App() {
    // --- Firebase State ---
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // --- App State ---
    const [workouts, setWorkouts] = useState([]); // List of workout templates
    const [activeWorkout, setActiveWorkout] = useState(null); // The workout currently being performed
    const [currentScreen, setCurrentScreen] = useState('home'); // 'home', 'createWorkout', 'activeWorkout', 'workoutHistory'
    const [editingWorkout, setEditingWorkout] = useState(null); // Workout template being edited or created
    
    const [workoutLogs, setWorkoutLogs] = useState([]); // History of completed workouts

    // --- Timer State ---
    const [timerActive, setTimerActive] = useState(false);
    const [timerPaused, setTimerPaused] = useState(false);
    const [timerSeconds, setTimerSeconds] = useState(180); // 3 minutes
    const timerIntervalRef = useRef(null);

    // --- Body Weight State ---
    const [bodyWeight, setBodyWeight] = useState('');
    const [showBodyWeightInput, setShowBodyWeightInput] = useState(false);

    // --- Notes State ---
    const [workoutNotes, setWorkoutNotes] = useState('');


    // --- Firebase Initialization and Auth ---
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);
            setDb(firestoreDb);
            setAuth(firebaseAuth);
            // firebase.firestore.setLogLevel('debug'); // Uncomment for Firestore debugging

            const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    // Try custom token first, then anonymous
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        try {
                            await signInWithCustomToken(firebaseAuth, __initial_auth_token);
                            // onAuthStateChanged will be called again with the signed-in user
                        } catch (customTokenError) {
                            console.error("Error signing in with custom token:", customTokenError);
                            await signInAnonymously(firebaseAuth);
                        }
                    } else {
                         await signInAnonymously(firebaseAuth);
                    }
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Error initializing Firebase:", error);
            // Handle initialization error (e.g., show an error message to the user)
            setIsAuthReady(true); // Still set to true to allow fallback or error display
        }
    }, []);


    // --- Data Fetching: Workouts (Templates) ---
    useEffect(() => {
        if (!db || !userId || !isAuthReady) return;

        const workoutsCollectionPath = `artifacts/${appId}/users/${userId}/workouts`;
        const q = query(collection(db, workoutsCollectionPath));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedWorkouts = [];
            querySnapshot.forEach((doc) => {
                fetchedWorkouts.push({ id: doc.id, ...doc.data() });
            });
            setWorkouts(fetchedWorkouts.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
        }, (error) => {
            console.error("Error fetching workouts:", error);
        });
        return () => unsubscribe();
    }, [db, userId, isAuthReady, appId]);

    // --- Data Fetching: Workout Logs (History) ---
    useEffect(() => {
        if (!db || !userId || !isAuthReady) return;

        const logsCollectionPath = `artifacts/${appId}/users/${userId}/workoutLogs`;
        const q = query(collection(db, logsCollectionPath)); // Consider ordering by date
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedLogs = [];
            querySnapshot.forEach((doc) => {
                fetchedLogs.push({ id: doc.id, ...doc.data() });
            });
             // Sort by date, most recent first
            setWorkoutLogs(fetchedLogs.sort((a, b) => (b.startTime?.toDate?.() || 0) - (a.startTime?.toDate?.() || 0)));
        }, (error) => {
            console.error("Error fetching workout logs:", error);
        });
        return () => unsubscribe();
    }, [db, userId, isAuthReady, appId]);


    // --- Timer Logic ---
    useEffect(() => {
        if (timerActive && !timerPaused) {
            timerIntervalRef.current = setInterval(() => {
                setTimerSeconds(prev => {
                    if (prev <= 1) {
                        clearInterval(timerIntervalRef.current);
                        setTimerActive(false);
                        // Optional: Play a sound or notification
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            clearInterval(timerIntervalRef.current);
        }
        return () => clearInterval(timerIntervalRef.current);
    }, [timerActive, timerPaused]);

    const startTimer = (duration = 180) => {
        setTimerSeconds(duration);
        setTimerActive(true);
        setTimerPaused(false);
    };

    const pauseTimer = () => setTimerPaused(true);
    const resumeTimer = () => setTimerPaused(false);
    const stopTimer = () => {
        setTimerActive(false);
        setTimerPaused(false);
        setTimerSeconds(180); // Reset to default
    };

    const formatTime = (totalSeconds) => {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    // --- Workout Template Management ---
    const handleCreateNewWorkout = () => {
        setEditingWorkout({ 
            id: null, // Will be set on save for new workout
            name: '', 
            exercises: [{ id: generateId(), name: '', targetSets: 3, targetReps: 10, targetWeight: '' }] 
        });
        setCurrentScreen('createWorkout');
    };

    const handleEditWorkoutTemplate = (workout) => {
        setEditingWorkout(JSON.parse(JSON.stringify(workout))); // Deep copy
        setCurrentScreen('createWorkout');
    };
    
    const handleSaveWorkoutTemplate = async () => {
        if (!db || !userId || !editingWorkout || !editingWorkout.name.trim()) {
            alert("Workout name cannot be empty."); // Replace with modal
            return;
        }

        const workoutToSave = {
            ...editingWorkout,
            exercises: editingWorkout.exercises.filter(ex => ex.name.trim() !== '') // Remove empty exercises
        };

        try {
            const workoutsCollectionPath = `artifacts/${appId}/users/${userId}/workouts`;
            if (workoutToSave.id) { // Existing workout
                const workoutDocRef = doc(db, workoutsCollectionPath, workoutToSave.id);
                await setDoc(workoutDocRef, workoutToSave, { merge: true });
            } else { // New workout
                await addDoc(collection(db, workoutsCollectionPath), workoutToSave);
            }
            setEditingWorkout(null);
            setCurrentScreen('home');
        } catch (error) {
            console.error("Error saving workout template:", error);
            alert("Failed to save workout. Please try again."); // Replace with modal
        }
    };

    const handleDeleteWorkoutTemplate = async (workoutId) => {
        if (!db || !userId || !window.confirm("Are you sure you want to delete this workout template?")) return; // Replace with modal
        try {
            const workoutDocRef = doc(db, `artifacts/${appId}/users/${userId}/workouts`, workoutId);
            await deleteDoc(workoutDocRef);
        } catch (error) {
            console.error("Error deleting workout template:", error);
            alert("Failed to delete workout template."); // Replace with modal
        }
    };

    const handleExerciseChange = (workoutIndex, field, value) => {
        setEditingWorkout(prev => {
            const newExercises = [...prev.exercises];
            newExercises[workoutIndex][field] = value;
            return { ...prev, exercises: newExercises };
        });
    };

    const addExerciseToTemplate = () => {
        setEditingWorkout(prev => ({
            ...prev,
            exercises: [...prev.exercises, { id: generateId(), name: '', targetSets: 3, targetReps: 10, targetWeight: '' }]
        }));
    };
    
    const removeExerciseFromTemplate = (exerciseId) => {
        setEditingWorkout(prev => ({
            ...prev,
            exercises: prev.exercises.filter(ex => ex.id !== exerciseId)
        }));
    };


    // --- Active Workout Management ---
    const handleStartWorkout = (workoutTemplate) => {
        const newActiveWorkout = {
            templateId: workoutTemplate.id,
            name: workoutTemplate.name,
            startTime: serverTimestamp(), // Firestore server timestamp
            bodyWeight: '', // Will be prompted or set
            notes: '',      // Will be prompted or set
            exercises: workoutTemplate.exercises.map(ex => ({
                ...ex, // Includes id, name, targetSets, targetReps, targetWeight
                loggedSets: Array(parseInt(ex.targetSets, 10) || 1).fill(null).map(() => ({ reps: '', weight: '', completed: false })),
            })),
            isCompleted: false
        };
        setActiveWorkout(newActiveWorkout);
        setWorkoutNotes(''); // Reset notes for new workout
        setBodyWeight('');   // Reset body weight
        setShowBodyWeightInput(true); // Prompt for body weight at start
        setCurrentScreen('activeWorkout');
    };

    const handleLogSet = (exerciseIndex, setIndex, reps, weight) => {
        setActiveWorkout(prev => {
            const updatedWorkout = { ...prev };
            updatedWorkout.exercises[exerciseIndex].loggedSets[setIndex] = { reps, weight, completed: true };
            return updatedWorkout;
        });
        startTimer(); // Start rest timer after logging a set
    };

    const handleAddSetToExercise = (exerciseIndex) => {
        setActiveWorkout(prev => {
            const updatedWorkout = { ...prev };
            updatedWorkout.exercises[exerciseIndex].loggedSets.push({ reps: '', weight: '', completed: false });
            return updatedWorkout;
        });
    };
    
    const handleSetInputChange = (exerciseIndex, setIndex, field, value) => {
        setActiveWorkout(prev => {
            const updatedWorkout = JSON.parse(JSON.stringify(prev)); // Deep copy
            updatedWorkout.exercises[exerciseIndex].loggedSets[setIndex][field] = value;
            // If reps and weight are filled, mark as completed (or require explicit button)
            // For now, let's assume filling reps marks it loggable
            return updatedWorkout;
        });
    };

    const handleFinishWorkout = async () => {
        if (!db || !userId || !activeWorkout) return;

        const finalBodyWeight = bodyWeight || activeWorkout.bodyWeight || ''; // Prioritize current input
        const finalNotes = workoutNotes || activeWorkout.notes || '';

        const workoutLog = {
            ...activeWorkout,
            bodyWeight: finalBodyWeight,
            notes: finalNotes,
            endTime: serverTimestamp(),
            isCompleted: true,
            exercises: activeWorkout.exercises.map(ex => ({
                ...ex,
                loggedSets: ex.loggedSets.filter(s => s.completed) // Only save completed sets
            }))
        };

        try {
            const logsCollectionPath = `artifacts/${appId}/users/${userId}/workoutLogs`;
            await addDoc(collection(db, logsCollectionPath), workoutLog);
            setActiveWorkout(null);
            setCurrentScreen('home');
            stopTimer();
            setBodyWeight('');
            setWorkoutNotes('');
            setShowBodyWeightInput(false);
        } catch (error) {
            console.error("Error finishing workout:", error);
            alert("Failed to save workout log."); // Replace with modal
        }
    };

    // --- UI Rendering ---
    const renderScreen = () => {
        if (!isAuthReady) {
            return <div className="flex justify-center items-center h-screen bg-gray-900 text-white"><Clock className="animate-spin mr-2" />Loading...</div>;
        }

        switch (currentScreen) {
            case 'home':
                return <HomeScreen />;
            case 'createWorkout':
                return <CreateEditWorkoutScreen />;
            case 'activeWorkout':
                return <ActiveWorkoutScreen />;
            case 'workoutHistory':
                return <WorkoutHistoryScreen />;
            default:
                return <HomeScreen />;
        }
    };

    // --- Screen Components ---

    const HomeScreen = () => (
        <div className="p-4 md:p-6">
            <h1 className="text-3xl font-bold mb-6 text-center text-pink-500">My Workouts</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {workouts.map(workout => (
                    <div key={workout.id} className="bg-gray-800 p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow">
                        <h2 className="text-xl font-semibold mb-2 text-pink-400">{workout.name}</h2>
                        <ul className="text-sm text-gray-400 mb-3 list-disc list-inside">
                            {(workout.exercises || []).slice(0,3).map(ex => (
                                <li key={ex.id}>{ex.name} ({ex.targetSets}x{ex.targetReps} {ex.targetWeight ? `@ ${ex.targetWeight}lbs` : ''})</li>
                            ))}
                            {(workout.exercises || []).length > 3 && <li>...and more</li>}
                        </ul>
                        <div className="flex justify-between items-center">
                            <button
                                onClick={() => handleStartWorkout(workout)}
                                className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-2 px-4 rounded-lg flex items-center transition-colors"
                            >
                                <Play size={18} className="mr-2" /> Start
                            </button>
                            <div>
                                <button onClick={() => handleEditWorkoutTemplate(workout)} className="text-blue-400 hover:text-blue-300 mr-2 p-1"><Edit3 size={18}/></button>
                                <button onClick={() => handleDeleteWorkoutTemplate(workout.id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={18}/></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <button
                onClick={handleCreateNewWorkout}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center text-lg transition-colors"
            >
                <PlusCircle size={22} className="mr-2" /> Create New Workout Plan
            </button>
        </div>
    );

    const CreateEditWorkoutScreen = () => {
        if (!editingWorkout) return null; // Should not happen if screen is active
        return (
            <div className="p-4 md:p-6">
                <h1 className="text-3xl font-bold mb-6 text-center text-pink-500">
                    {editingWorkout.id ? 'Edit Workout Plan' : 'Create New Workout Plan'}
                </h1>
                <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
                    <div className="mb-6">
                        <label htmlFor="workoutName" className="block text-sm font-medium text-gray-300 mb-1">Workout Name</label>
                        <input
                            type="text"
                            id="workoutName"
                            value={editingWorkout.name}
                            onChange={(e) => setEditingWorkout(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3 focus:ring-pink-500 focus:border-pink-500"
                            placeholder="e.g., Pull Day, Leg Blast"
                        />
                    </div>

                    <h2 className="text-xl font-semibold mb-3 text-pink-400">Exercises</h2>
                    {editingWorkout.exercises.map((exercise, index) => (
                        <div key={exercise.id} className="bg-gray-700 p-4 rounded-md mb-4 border border-gray-600">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-lg font-medium text-gray-200">Exercise #{index + 1}</span>
                                <button onClick={() => removeExerciseFromTemplate(exercise.id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={18}/></button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor={`exName-${exercise.id}`} className="block text-xs text-gray-400 mb-1">Name</label>
                                    <input type="text" id={`exName-${exercise.id}`} value={exercise.name} onChange={(e) => handleExerciseChange(index, 'name', e.target.value)} placeholder="Exercise Name" className="w-full bg-gray-600 border-gray-500 text-white rounded p-2 text-sm"/>
                                </div>
                                <div>
                                    <label htmlFor={`exSets-${exercise.id}`} className="block text-xs text-gray-400 mb-1">Target Sets</label>
                                    <input type="number" id={`exSets-${exercise.id}`} value={exercise.targetSets} onChange={(e) => handleExerciseChange(index, 'targetSets', e.target.value)} placeholder="Sets" className="w-full bg-gray-600 border-gray-500 text-white rounded p-2 text-sm"/>
                                </div>
                                <div>
                                    <label htmlFor={`exReps-${exercise.id}`} className="block text-xs text-gray-400 mb-1">Target Reps</label>
                                    <input type="number" id={`exReps-${exercise.id}`} value={exercise.targetReps} onChange={(e) => handleExerciseChange(index, 'targetReps', e.target.value)} placeholder="Reps" className="w-full bg-gray-600 border-gray-500 text-white rounded p-2 text-sm"/>
                                </div>
                                <div>
                                    <label htmlFor={`exWeight-${exercise.id}`} className="block text-xs text-gray-400 mb-1">Target Weight (lbs)</label>
                                    <input type="number" id={`exWeight-${exercise.id}`} value={exercise.targetWeight} onChange={(e) => handleExerciseChange(index, 'targetWeight', e.target.value)} placeholder="Weight" className="w-full bg-gray-600 border-gray-500 text-white rounded p-2 text-sm"/>
                                </div>
                            </div>
                        </div>
                    ))}
                    <button onClick={addExerciseToTemplate} className="w-full text-green-400 hover:text-green-300 border-2 border-green-500 hover:border-green-400 rounded-lg py-2 px-4 mb-6 flex items-center justify-center transition-colors">
                        <PlusCircle size={20} className="mr-2"/> Add Exercise
                    </button>

                    <div className="flex justify-end space-x-3">
                        <button onClick={() => { setEditingWorkout(null); setCurrentScreen('home'); }} className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Cancel</button>
                        <button onClick={handleSaveWorkoutTemplate} className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center">
                            <Save size={18} className="mr-2"/> Save Plan
                        </button>
                    </div>
                </div>
            </div>
        );
    };
    
    const ActiveWorkoutScreen = () => {
        if (!activeWorkout) return <div className="p-4 text-center">No active workout. Go back to select one.</div>;

        return (
            <div className="p-4 md:p-6">
                <div className="flex justify-between items-center mb-4">
                    <button onClick={() => { setActiveWorkout(null); setCurrentScreen('home'); stopTimer(); }} className="text-pink-400 hover:text-pink-300 flex items-center">
                        <XCircle size={20} className="mr-1"/> End Workout (Discard)
                    </button>
                    <h1 className="text-3xl font-bold text-pink-500 text-center">{activeWorkout.name}</h1>
                    <div/> {/* Spacer */}
                </div>

                {/* Body Weight Input */}
                {showBodyWeightInput && (
                    <div className="mb-6 bg-gray-800 p-4 rounded-lg">
                        <label htmlFor="bodyWeight" className="block text-sm font-medium text-gray-300 mb-1">Current Body Weight (lbs)</label>
                        <div className="flex items-center space-x-2">
                            <input
                                type="number"
                                id="bodyWeight"
                                value={bodyWeight}
                                onChange={(e) => setBodyWeight(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-2 focus:ring-pink-500 focus:border-pink-500"
                                placeholder="e.g., 167.2"
                            />
                            <button onClick={() => setShowBodyWeightInput(false)} className="bg-pink-500 hover:bg-pink-600 text-white p-2 rounded-lg"><CheckCircle size={20}/></button>
                        </div>
                    </div>
                )}


                {activeWorkout.exercises.map((exercise, exIndex) => (
                    <div key={exercise.id} className="bg-gray-800 p-4 rounded-lg shadow-md mb-4">
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-xl font-semibold text-pink-400">{exercise.name}</h2>
                            <span className="text-sm text-gray-400">Target: {exercise.targetSets}x{exercise.targetReps} {exercise.targetWeight ? `@ ${exercise.targetWeight}lbs` : ''}</span>
                        </div>
                        
                        {exercise.loggedSets.map((set, setIndex) => (
                            <div key={setIndex} className={`flex items-center space-x-2 mb-3 p-3 rounded-md ${set.completed ? 'bg-green-800 border-green-600' : 'bg-gray-700 border-gray-600'} border`}>
                                <span className="text-gray-300 font-medium w-8 text-center">Set {setIndex + 1}</span>
                                <input 
                                    type="number" 
                                    placeholder="Reps" 
                                    value={set.reps}
                                    onChange={(e) => handleSetInputChange(exIndex, setIndex, 'reps', e.target.value)}
                                    className="bg-gray-600 text-white border border-gray-500 rounded-full w-20 h-12 text-center text-lg appearance-none focus:ring-pink-500 focus:border-pink-500"
                                />
                                <span className="text-gray-400">x</span>
                                <input 
                                    type="number" 
                                    placeholder="lbs" 
                                    value={set.weight}
                                    onChange={(e) => handleSetInputChange(exIndex, setIndex, 'weight', e.target.value)}
                                    className="bg-gray-600 text-white border border-gray-500 rounded-full w-20 h-12 text-center text-lg appearance-none focus:ring-pink-500 focus:border-pink-500"
                                />
                                {!set.completed && (set.reps || set.weight) && (
                                    <button 
                                        onClick={() => handleLogSet(exIndex, setIndex, set.reps, set.weight)}
                                        className="bg-green-500 hover:bg-green-600 text-white p-2 rounded-full"
                                        title="Log Set"
                                    >
                                        <CheckCircle size={20} />
                                    </button>
                                )}
                                {set.completed && <CheckCircle size={24} className="text-green-400" title="Set Logged"/>}
                            </div>
                        ))}
                        <button 
                            onClick={() => handleAddSetToExercise(exIndex)}
                            className="w-full text-sm text-blue-400 hover:text-blue-300 border border-blue-500 hover:border-blue-400 rounded-lg py-1.5 px-3 mt-1 flex items-center justify-center transition-colors"
                        >
                           <PlusCircle size={16} className="mr-1"/> Add Set
                        </button>
                    </div>
                ))}

                {/* Notes Section */}
                <div className="my-6 bg-gray-800 p-4 rounded-lg">
                    <label htmlFor="workoutNotes" className="block text-sm font-medium text-gray-300 mb-1">Workout Notes</label>
                    <textarea
                        id="workoutNotes"
                        value={workoutNotes}
                        onChange={(e) => setWorkoutNotes(e.target.value)}
                        rows="3"
                        className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-2 focus:ring-pink-500 focus:border-pink-500"
                        placeholder="How did it go? Any PRs?"
                    ></textarea>
                </div>


                <button 
                    onClick={handleFinishWorkout}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg text-lg flex items-center justify-center transition-colors"
                >
                    <CheckCircle size={22} className="mr-2"/> Finish & Save Workout
                </button>
            </div>
        );
    };

    const WorkoutHistoryScreen = () => (
        <div className="p-4 md:p-6">
            <h1 className="text-3xl font-bold mb-6 text-center text-pink-500">Workout History</h1>
            {workoutLogs.length === 0 && <p className="text-gray-400 text-center">No completed workouts yet. Go crush one!</p>}
            <div className="space-y-4">
                {workoutLogs.map(log => (
                    <div key={log.id} className="bg-gray-800 p-4 rounded-lg shadow-md">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h2 className="text-xl font-semibold text-pink-400">{log.name}</h2>
                                <p className="text-sm text-gray-400">
                                    {log.startTime?.toDate ? new Date(log.startTime.toDate()).toLocaleDateString() : 'Date N/A'}
                                    {log.startTime?.toDate && log.endTime?.toDate && 
                                        ` (${Math.round((log.endTime.toDate().getTime() - log.startTime.toDate().getTime()) / 60000)} min)`}
                                </p>
                            </div>
                            {log.bodyWeight && <p className="text-sm text-gray-300">Body Wt: {log.bodyWeight} lbs</p>}
                        </div>
                        
                        {(log.exercises || []).map((ex, idx) => (
                            <details key={idx} className="mb-1 last:mb-0">
                                <summary className="text-md text-gray-300 cursor-pointer hover:text-pink-300 py-1 flex items-center">
                                    <ChevronDown size={16} className="mr-2 group-open:hidden" />
                                    <ChevronUp size={16} className="mr-2 hidden group-open:inline" />
                                    {ex.name}
                                </summary>
                                <div className="pl-6 pt-1 pb-2 text-xs text-gray-400 border-l border-gray-700 ml-2">
                                    {ex.loggedSets.map((s, sIdx) => (
                                        <div key={sIdx}>Set {sIdx + 1}: {s.reps} reps @ {s.weight} lbs</div>
                                    ))}
                                    {ex.loggedSets.length === 0 && <div>No sets logged for this exercise.</div>}
                                </div>
                            </details>
                        ))}
                        {log.notes && <p className="mt-2 text-sm text-gray-300 italic border-t border-gray-700 pt-2">Notes: {log.notes}</p>}
                    </div>
                ))}
            </div>
        </div>
    );

    // --- Timer Display ---
    const TimerDisplay = () => {
        if (!timerActive) return null;
        return (
            <div className="fixed bottom-0 left-0 right-0 bg-gray-800 p-4 border-t-2 border-pink-500 shadow-2xl z-50">
                <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center">
                    <div className="text-center sm:text-left mb-2 sm:mb-0">
                        <p className="text-sm text-gray-400">Rest Timer</p>
                        <p className="text-4xl font-bold text-pink-400">{formatTime(timerSeconds)}</p>
                    </div>
                    <div className="flex space-x-2">
                        {timerPaused ? (
                            <button onClick={resumeTimer} className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center"><Play size={18} className="mr-1"/> Resume</button>
                        ) : (
                            <button onClick={pauseTimer} className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center"><Pause size={18} className="mr-1"/> Pause</button>
                        )}
                        <button onClick={stopTimer} className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center"><StopCircle size={18} className="mr-1"/> Stop</button>
                    </div>
                </div>
            </div>
        );
    };
    
    // --- Main Layout ---
    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans flex flex-col">
            {/* Header/Navbar - Basic for now */}
            <header className="bg-gray-800 shadow-md sticky top-0 z-40">
                <div className="container mx-auto px-4 py-3 flex justify-between items-center">
                    <div className="text-2xl font-bold text-pink-500 flex items-center">
                        <Dumbbell size={28} className="mr-2"/> FitTrack
                    </div>
                    <div className="text-xs text-gray-400">User: {userId ? userId.substring(0,8)+'...' : 'Loading...'}</div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-grow container mx-auto px-0 sm:px-4 py-4">
                {renderScreen()}
            </main>

            {/* Timer Display */}
            <TimerDisplay />

            {/* Footer Navigation */}
            <footer className="bg-gray-800 border-t border-gray-700 p-3 sticky bottom-0 z-30 mt-auto">
                <nav className="container mx-auto flex justify-around items-center">
                    <button onClick={() => setCurrentScreen('home')} className={`flex flex-col items-center p-2 rounded-md ${currentScreen === 'home' ? 'text-pink-400' : 'text-gray-400 hover:text-pink-300'}`}>
                        <Home size={22}/> <span className="text-xs mt-1">Home</span>
                    </button>
                    {/* <button onClick={() => setCurrentScreen('programs')} className={`flex flex-col items-center p-2 rounded-md ${currentScreen === 'programs' ? 'text-pink-400' : 'text-gray-400 hover:text-pink-300'}`}>
                        <ListChecks size={22}/> <span className="text-xs mt-1">Programs</span>
                    </button> */}
                    <button onClick={() => setCurrentScreen('workoutHistory')} className={`flex flex-col items-center p-2 rounded-md ${currentScreen === 'workoutHistory' ? 'text-pink-400' : 'text-gray-400 hover:text-pink-300'}`}>
                        <Calendar size={22}/> <span className="text-xs mt-1">History</span>
                    </button>
                    {/* <button onClick={() => setCurrentScreen('progress')} className={`flex flex-col items-center p-2 rounded-md ${currentScreen === 'progress' ? 'text-pink-400' : 'text-gray-400 hover:text-pink-300'}`}>
                        <BarChart2 size={22}/> <span className="text-xs mt-1">Progress</span>
                    </button>
                    <button onClick={() => setCurrentScreen('settings')} className={`flex flex-col items-center p-2 rounded-md ${currentScreen === 'settings' ? 'text-pink-400' : 'text-gray-400 hover:text-pink-300'}`}>
                        <Settings size={22}/> <span className="text-xs mt-1">Settings</span>
                    </button> */}
                </nav>
            </footer>
        </div>
    );
}

export default App;


