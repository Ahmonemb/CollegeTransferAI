// filepath: c:\Users\notto\Desktop\Desktop\Projects\CollegeTransferAI\src\components\CourseMap.jsx
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'; // Added useMemo
import ReactFlow, {
  Controls, Background, addEdge, MiniMap, BackgroundVariant,
  ReactFlowProvider, useReactFlow, useNodesState, useEdgesState,
  Position // Import Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import { fetchData } from '../services/api';
import CustomCourseNode from './CustomCourseNode'; // Import the custom node

// --- Default/Initial Data (used for NEW maps) ---
const defaultNodes = []; // Start new maps empty
const defaultEdges = [];
// --- End Default Data ---

let idCounter = 0; // Reset counter, will be updated based on loaded nodes
const getUniqueNodeId = () => `new_node_${idCounter++}`;

// --- Edit Input Component (remains the same) ---
function EditInput({ element, value, onChange, onSave }) {
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === 'Escape') onSave();
  };
  return (
    <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 10, background: 'white', padding: '5px', border: '1px solid #ccc', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '5px' }}>
      <label htmlFor="inline-edit" style={{fontSize: '0.9em', whiteSpace: 'nowrap'}}>
        Edit {element?.type === 'edge' ? 'Prereq' : 'Course'} Name:
      </label>
      <input id="inline-edit" ref={inputRef} type="text" value={value} onChange={onChange} onBlur={onSave} onKeyDown={handleKeyDown} style={{ padding: '4px' }} />
    </div>
  );
}
// --- End Edit Input Component ---

// --- Helper Functions for Cache ---
const getCacheKey = (base, userId, mapId = null) => {
    if (!userId) return null; // Cannot generate key without user ID
    return mapId ? `${base}-${userId}-${mapId}` : `${base}-${userId}`;
};

const loadFromCache = (key) => {
    if (!key) return null;
    try {
        const cachedData = localStorage.getItem(key);
        if (cachedData) {
            console.log(`Loaded from cache: ${key}`);
            return JSON.parse(cachedData);
        }
    } catch (e) {
        console.error(`Failed to read or parse cache for ${key}:`, e);
        localStorage.removeItem(key); // Clear potentially corrupted cache
    }
    return null;
};

const saveToCache = (key, data) => {
    if (!key) return;
    try {
        localStorage.setItem(key, JSON.stringify(data));
        console.log(`Saved to cache: ${key}`);
    } catch (e) {
        console.error(`Failed to save to cache for ${key}:`, e);
        // Handle potential storage limits if necessary
    }
};

const removeFromCache = (key) => {
    if (!key) return;
    try {
        localStorage.removeItem(key);
        console.log(`Removed from cache: ${key}`);
    } catch (e) {
        console.error(`Failed to remove cache for ${key}:`, e);
    }
};
// --- End Helper Functions for Cache ---


function CourseMapFlow({ user }) { // user object now contains id, idToken, etc. or is null
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);
  const [editingElement, setEditingElement] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');

  // --- State for Multiple Maps ---
  const [mapList, setMapList] = useState([]); // List of { map_id, map_name, last_updated }
  const [currentMapId, setCurrentMapId] = useState(null); // ID of the currently loaded map
  const [currentMapName, setCurrentMapName] = useState('Untitled Map'); // Name of the current map
  const [isMapListLoading, setIsMapListLoading] = useState(true);
  // --- End State for Multiple Maps ---

  const isLoggedIn = !!user; // Check if user object exists

  const userId = user?.id; // Get user ID for cache keys

  // --- Load Map List (with Cache) ---
  const loadMapList = useCallback(async (forceRefresh = false) => {
    const cacheKey = getCacheKey('courseMapList', userId);
    // If not logged in, don't attempt to load or cache user-specific lists
    if (!isLoggedIn) {
        setMapList([]);
        setIsMapListLoading(false);
        return [];
    }

    // Try loading from cache first unless forcing refresh
    if (!forceRefresh) {
        const cachedList = loadFromCache(cacheKey);
        if (cachedList && Array.isArray(cachedList)) { // Added Array.isArray check for cache
            setMapList(cachedList);
            setIsMapListLoading(false);
            return cachedList;
        } else if (cachedList) {
            console.warn("Cached map list was not an array, removing:", cachedList);
            removeFromCache(cacheKey); // Remove invalid cache
        }
    }

    // If not cached or forcing refresh, fetch from API
    setIsMapListLoading(true);
    try {
      console.log("Fetching map list from API...");
      const responseData = await fetchData('course-maps', { // Renamed 'list' to 'responseData'
        headers: { 'Authorization': `Bearer ${user.idToken}` }
      });
      console.log("Raw API response for map list:", responseData); // Log the raw response

      // --- Added Check ---
      // Ensure responseData is an array before setting state
      const validList = Array.isArray(responseData) ? responseData : [];
      if (!Array.isArray(responseData)) {
          console.warn("API response for map list was not an array:", responseData);
      }
      // --- End Check ---

      setMapList(validList);
      saveToCache(cacheKey, validList); // Save fetched list to cache
      console.log("Map list fetched and cached:", validList);
      return validList;
    } catch (error) {
      console.error("Failed to load map list:", error);
      setSaveStatus(`Error loading map list: ${error.message}`);
      setMapList([]); // Reset on error
      removeFromCache(cacheKey); // Clear potentially stale cache on error
      return [];
    } finally {
      setIsMapListLoading(false);
    }
  }, [userId, user?.idToken, isLoggedIn]); // Add isLoggedIn dependency

  const handleNewMap = useCallback(async () => {
    // Check isLoggedIn first
    if (!isLoggedIn) {
      setSaveStatus("Please log in to create a new map.");
      return;
    }

    const mapName = prompt("Enter a name for the new map:", "Untitled Map");
    if (mapName === null) { // User cancelled prompt
      setSaveStatus(''); // Clear saving status
      return;
    }
    console.log("Initiating new map creation via API...");
    setIsLoading(true); // Show loading state for the map area
    setSaveStatus("Creating new map...");

    try {
      // Call the backend endpoint to create the empty map record
      const newMapData = await fetchData('course-map', { // POST to the collection endpoint
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.idToken}`,
          'Content-Type': 'application/json' // Good practice
        },
        // --- Send map_name AND empty nodes/edges ---
        body: JSON.stringify({
            map_name: mapName,
            nodes: [], // Always send empty nodes array for new map
            edges: []  // Always send empty edges array for new map
        })
        // --- End Change ---
      });

      // --- Response handling remains the same ---
      if (newMapData && newMapData.map_id) {
        console.log("New map record created:", newMapData);

        // 1. Update Map List State & Cache
        const newMapEntry = {
          map_id: newMapData.map_id,
          map_name: newMapData.map_name || mapName, // Use returned name or prompted name
          last_updated: newMapData.last_updated || new Date().toISOString() // Use returned date or now
        };
        setMapList(prevList => {
          const newList = [newMapEntry, ...prevList];
          newList.sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated));
          const listCacheKey = getCacheKey('courseMapList', userId);
          saveToCache(listCacheKey, newList); // Update list cache
          return newList;
        });

        // 2. Update Current Map State
        setNodes(defaultNodes); // Reset nodes/edges for the new map
        setEdges(defaultEdges);
        setCurrentMapId(newMapData.map_id); // Set the new ID
        setCurrentMapName(newMapEntry.map_name); // Set the name from newMapEntry
        idCounter = 0; // Reset node counter

        // 3. Update Specific Map Cache (optional but good practice)
        const mapCacheKey = getCacheKey('courseMap', userId, newMapData.map_id);
        saveToCache(mapCacheKey, { // Cache the initial empty state
            nodes: defaultNodes,
            edges: defaultEdges,
            map_id: newMapData.map_id,
            map_name: newMapEntry.map_name,
            last_updated: newMapEntry.last_updated
        });

        setSaveStatus("New map created.");
        setTimeout(() => setSaveStatus(''), 2000);

      } else {
        throw new Error("Failed to create map record: Invalid response from server.");
      }
      // --- End Response handling ---

    } catch (error) {
      console.error("Failed to create new map:", error);
      setSaveStatus(`Error creating map: ${error.message}`);
      // Don't reset state here, keep the user's current view
    } finally {
      setIsLoading(false); // Hide loading state
    }
  }, [userId, user?.idToken, setNodes, setEdges, setMapList, isLoggedIn]); // Add isLoggedIn dependency

  // --- Load Specific Map (with Cache) ---
  const loadSpecificMap = useCallback(async (mapId, forceRefresh = false) => {
    const cacheKey = getCacheKey('courseMap', userId, mapId);

    // If not logged in, always show the default empty state
    if (!isLoggedIn) {
      setNodes(defaultNodes);
      setEdges(defaultEdges);
      setCurrentMapId(null);
      setCurrentMapName('Untitled Map');
      idCounter = 0;
      setIsLoading(false);
      setSaveStatus(''); // Clear any previous status
      return;
    }

    if (!userId || !mapId) { // Handle new map case
      setNodes(defaultNodes);
      setEdges(defaultEdges);
      setCurrentMapId(null);
      setCurrentMapName('Untitled Map');
      idCounter = 0;
      setIsLoading(false);
      setSaveStatus(''); // Clear any previous status
      return;
    }

    setIsLoading(true);
    setSaveStatus('');

    // Try loading from cache first unless forcing refresh
    if (!forceRefresh) {
        const cachedMap = loadFromCache(cacheKey);
        if (cachedMap && cachedMap.nodes && cachedMap.edges) {
            const loadedNodes = cachedMap.nodes.map(node => ({
                ...node,
                type: node.type || 'courseNode' // Assign 'courseNode' if type is missing or default
            }));
            setNodes(loadedNodes);
            setEdges(cachedMap.edges);
            setCurrentMapId(cachedMap.map_id);
            setCurrentMapName(cachedMap.map_name || 'Untitled Map');
            idCounter = cachedMap.nodes.reduce((maxId, node) => {
                const match = node.id.match(/^new_node_(\d+)$/);
                return match ? Math.max(maxId, parseInt(match[1], 10) + 1) : maxId;
            }, cachedMap.nodes.length);
            setIsLoading(false);
            return; // Exit early if loaded from cache
        }
    }

    // If not cached or forcing refresh, fetch from API
    console.log(`Fetching map data for ID: ${mapId} from API...`);
    try {
      const data = await fetchData(`course-map/${mapId}`, {
        headers: { 'Authorization': `Bearer ${user.idToken}` }
      });
      if (data && data.nodes && data.edges) {
        console.log("Loaded map data from API:", data);
        const loadedNodes = data.nodes.map(node => ({
            ...node,
            type: node.type || 'courseNode' // Assign 'courseNode' if type is missing or default
        }));
        setNodes(loadedNodes);
        setEdges(data.edges);
        setCurrentMapId(data.map_id);
        setCurrentMapName(data.map_name || 'Untitled Map');
        idCounter = data.nodes.reduce((maxId, node) => {
            const match = node.id.match(/^new_node_(\d+)$/);
            return match ? Math.max(maxId, parseInt(match[1], 10) + 1) : maxId;
        }, data.nodes.length);
        saveToCache(cacheKey, data); // Save fetched map to cache
      } else {
        console.warn(`Map ${mapId} not found or invalid data from API.`);
        setSaveStatus(`Error: Map ${mapId} not found.`);
        removeFromCache(cacheKey); // Remove potentially invalid cache entry
        handleNewMap(); // Reset to a new map state
      }
    } catch (error) {
      console.error(`Failed to load course map ${mapId}:`, error);
      setSaveStatus(`Error loading map: ${error.message}`);
      removeFromCache(cacheKey); // Remove potentially invalid cache entry
      handleNewMap(); // Reset to a new map state on error
    } finally {
      setIsLoading(false);
    }
  }, [userId, user?.idToken, setNodes, setEdges, handleNewMap, isLoggedIn]); // Add isLoggedIn dependency

  // --- Initial Load Effect ---
  useEffect(() => {
    setIsLoading(true); // Set loading true initially
    // If logged in, load the list and then the appropriate map
    if (isLoggedIn) {
        loadMapList().then((list) => {
            if (list && list.length > 0) {
                loadSpecificMap(list[0].map_id);
            } else {
                loadSpecificMap(null); // Load empty state if no maps found
            }
        });
    } else {
        // If not logged in, just load the empty state directly
        loadSpecificMap(null);
    }
  }, [loadMapList, loadSpecificMap, isLoggedIn]); // Add isLoggedIn dependency

  // --- Save Map Data (Create or Update) ---
  const handleSave = useCallback(async () => {
    // Check isLoggedIn first
    if (!isLoggedIn) {
      setSaveStatus("Please log in to save changes.");
      return;
    }
    setSaveStatus("Saving...");
    console.log(`Attempting to save map: ${currentMapId || '(new)'}`);

    // --- Track if it's a new map being saved ---
    const isNewMapInitially = !currentMapId;
    // --- End Track ---

    // Prompt for name if it's a new map or untitled
    let mapNameToSave = currentMapName;
    if (currentMapName === 'Untitled Map') {
        const newName = prompt("Enter a name for this map:", currentMapName);
        if (newName === null) { // User cancelled prompt
            setSaveStatus(''); // Clear saving status
            return;
        }
        mapNameToSave = newName.trim() || 'Untitled Map'; // Use new name or default
        setCurrentMapName(mapNameToSave); // Update state immediately
    }

    if (!currentMapId) {
      // This case should ideally not happen if handleNewMap always creates an ID first.
      // But as a fallback, maybe call handleNewMap first? Or show an error.
      console.error("Save attempted without a currentMapId. Please create a new map first.");
      setSaveStatus("Error: Cannot save, no map selected/created.");
      // OR potentially trigger handleNewMap here, though it might be confusing UX.
      // await handleNewMap(); // This would create it, then the rest of save would update it immediately.
      return;
    }

    try {
      const payload = {
        nodes,
        edges,
        map_name: mapNameToSave, // Send the potentially updated name
        map_id: currentMapId // Send currentMapId (null if new)
      };
      const result = await fetchData('course-map', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.idToken}`
        },
        body: JSON.stringify(payload)
      });

      console.log("Map saved successfully:", result);
      setSaveStatus("Map saved!");
      const savedMapId = result?.map_id; // Use returned ID if new, else current

      if (savedMapId) {
        setCurrentMapId(savedMapId); // Update state if it was a new map

        // Update specific map cache
        const mapCacheKey = getCacheKey('courseMap', userId, savedMapId);
        const updatedMapData = {
             nodes,
             edges,
             map_id: savedMapId,
             map_name: mapNameToSave,
             last_updated: new Date().toISOString() // Add current timestamp
         };
        saveToCache(mapCacheKey, updatedMapData);

        // --- Update mapList state directly if it was a new map ---
        if (isNewMapInitially) {
            const newMapEntry = {
                map_id: savedMapId,
                map_name: mapNameToSave,
                last_updated: updatedMapData.last_updated // Use the same timestamp
            };
            setMapList(prevList => {
                // Add the new map and re-sort by date descending
                const newList = [newMapEntry, ...prevList];
                newList.sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated));
                // Update cache for the list as well
                const listCacheKey = getCacheKey('courseMapList', userId);
                saveToCache(listCacheKey, newList);
                return newList;
            });
        } else {
            // If updating an existing map, just refresh the list from API
            // to get potentially updated 'last_updated' timestamp and ensure consistency.
             loadMapList(true); // Force refresh map list cache from API
        }
        // --- End Update ---

      } else if (!isNewMapInitially) {
          // If it wasn't a new map but we didn't get an ID back (shouldn't happen on update success)
          // still refresh the list just in case something changed (like the name)
          loadMapList(true);
      }


      setTimeout(() => setSaveStatus(''), 2000);
    } catch (error) {
      console.error("Failed to save course map:", error);
      setSaveStatus(`Error saving map: ${error.message}`);
    }
  }, [userId, user?.idToken, nodes, edges, currentMapId, currentMapName, loadMapList, setMapList, isLoggedIn]); // Add isLoggedIn dependency
  

  // --- Handle Map Selection Change ---
  const handleMapSelectChange = (event) => {
    // If not logged in, selecting anything should just show the empty map
    if (!isLoggedIn) {
        loadSpecificMap(null);
        return;
    }
    const selectedId = event.target.value;
    if (selectedId === "__NEW__") {
        console.log("Selected [Untitled Map], resetting view.");
        loadSpecificMap(null);
    } else {
        // Load existing map (check cache first)
        loadSpecificMap(selectedId);
    }
  };

    // --- Handle Delete Map ---
    const handleDeleteMap = useCallback(async () => {
      // Check isLoggedIn first
      if (!isLoggedIn) {
          setSaveStatus("Please log in to delete maps.");
          return;
      }

      if (!currentMapId || !userId || !user?.idToken) {
          setSaveStatus("No map selected to delete or not logged in.");
          return;
      }

      if (!confirm(`Are you sure you want to delete the map "${currentMapName}"? This cannot be undone.`)) {
          return;
      }

      const mapToDeleteId = currentMapId; // Capture ID before state changes
      const mapCacheKey = getCacheKey('courseMap', userId, mapToDeleteId);
      const listCacheKey = getCacheKey('courseMapList', userId); // Cache key for the list

      console.log(`[Delete Attempt] User ID: ${userId}, Map ID: ${mapToDeleteId}`);
      setSaveStatus("Deleting...");

      try {
          // --- Call Backend DELETE ---
          await fetchData(`course-map/${mapToDeleteId}`, {
              method: 'DELETE',
              headers: {
                  'Authorization': `Bearer ${user.idToken}`
              }
          });
          // --- Backend Delete Successful ---

          console.log("Map deleted successfully from backend.");
          setSaveStatus("Map deleted.");

          // --- Frontend Cleanup ---
          // 1. Remove from specific map cache
          removeFromCache(mapCacheKey);

          // 2. Update mapList state and list cache
          let nextMapIdToLoad = null;
          setMapList(prevList => {
              const newList = prevList.filter(map => map.map_id !== mapToDeleteId);
              // Determine which map to load next (e.g., the first one in the updated list)
              if (newList.length > 0) {
                  newList.sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated)); // Re-sort just in case
                  nextMapIdToLoad = newList[0].map_id;
              }
              saveToCache(listCacheKey, newList); // Update list cache
              return newList;
          });

          // 3. Load the next map (or reset if list is empty)
          if (nextMapIdToLoad) {
              loadSpecificMap(nextMapIdToLoad);
          } else {
              // No maps left, reset to a new, unsaved state
              setNodes(defaultNodes);
              setEdges(defaultEdges);
              setCurrentMapId(null);
              setCurrentMapName('Untitled Map');
              idCounter = 0;
              // Optionally, call handleNewMap() if you want to immediately prompt for a name
              // handleNewMap();
          }
          // --- End Frontend Cleanup ---

          setTimeout(() => setSaveStatus(''), 2000);

      } catch (error) {
          console.error(`[Delete Failed] User ID: ${userId}, Map ID: ${mapToDeleteId}`, error);
          setSaveStatus(`Error deleting map: ${error.message}`);
          // Optionally, force refresh the list from API on error to ensure consistency
          loadMapList(true);
      }
  }, [userId, user?.idToken, currentMapId, currentMapName, loadMapList, loadSpecificMap, setMapList, setNodes, setEdges, isLoggedIn]); // Add isLoggedIn dependency


  // --- Other Callbacks (onConnect, addNode, startEditing, handleEditChange, saveEdit, onPaneClick) remain the same ---
   const onConnect = useCallback((connection) => {
       // Allow connecting nodes even when not logged in
       const newEdge = { ...connection, label: 'Prereq' };
       setEdges((eds) => addEdge(newEdge, eds));
     }, [setEdges]);

   const addNode = useCallback(() => {
     // Allow adding nodes even when not logged in
     const newNodeId = getUniqueNodeId();
     const position = screenToFlowPosition({
       x: reactFlowWrapper.current.clientWidth / 2,
       y: reactFlowWrapper.current.clientHeight / 3,
     });
     const newNode = {
       id: newNodeId,
       type: 'courseNode', // Specify the custom node type here
       position,
       data: { label: `New Course ${idCounter}` }
     };
     setNodes((nds) => nds.concat(newNode));
   }, [screenToFlowPosition, setNodes]);

   const startEditing = (element, isEdge = false) => {
     setEditingElement({ ...element, type: isEdge ? 'edge' : 'node' });
     setEditValue(isEdge ? element.label || '' : element.data.label);
   };

   const onNodeDoubleClick = useCallback((event, node) => startEditing(node, false), []);
   const onEdgeDoubleClick = useCallback((event, edge) => startEditing(edge, true), []);
   const handleEditChange = (event) => setEditValue(event.target.value);

   const saveEdit = useCallback(() => {
     if (!editingElement) return;
     const newLabel = editValue.trim();
     if (editingElement.type === 'node') {
       setNodes((nds) => nds.map((n) => (n.id === editingElement.id ? { ...n, data: { ...n.data, label: newLabel } } : n)));
     } else if (editingElement.type === 'edge') {
       setEdges((eds) => eds.map((e) => (e.id === editingElement.id ? { ...e, label: newLabel } : e)));
     }
     setEditingElement(null);
     setEditValue('');
   }, [editingElement, editValue, setNodes, setEdges]);

   const onPaneClick = useCallback(() => saveEdit(), [saveEdit]);
  // --- End Other Callbacks ---

  // --- Define Node Types ---
  // Use useMemo to prevent this object from being recreated on every render
  const nodeTypes = useMemo(() => ({
      courseNode: CustomCourseNode, // Map 'courseNode' type to your component
      // You can add other custom node types here if needed
  }), []);

  // Render loading state for the whole map area
  if (isMapListLoading || isLoading) {
    // Show loading only if logged in and actually loading data
    if (isLoggedIn) {
        return <p>Loading course maps...</p>;
    }
    // If not logged in, loading is instant (just showing default state)
    // so don't show loading message, let the component render below.
  }

  return (
    <div style={{ height: 'calc(100vh - 60px)', width: '100%', border: '1px solid #ccc', position: 'relative' }} ref={reactFlowWrapper}>
      {editingElement && <EditInput element={editingElement} value={editValue} onChange={handleEditChange} onSave={saveEdit} />}

      {/* --- Login Required Note --- */}
      {!isLoggedIn && (
        <div style={{ padding: '10px', background: '#fff3cd', color: '#856404', borderBottom: '1px solid #ffeeba', textAlign: 'center', fontWeight: 'bold' }}>
          Please log in to save your course map or access saved maps.
        </div>
      )}

      {/* --- Map Management Bar --- */}
      <div style={{ padding: '10px', borderBottom: '1px solid #eee', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', background: '#f8f8f8' }}>
        {/* Display the current map name */}
        <span style={{fontWeight: 'bold'}}>Editing:</span>
        <span style={{ fontStyle: currentMapId || !isLoggedIn ? 'italic' : 'normal' }}>
            {currentMapName} {currentMapId || !isLoggedIn ? '(unsaved)' : ''}
        </span>
        <span style={{margin: '0 5px'}}>|</span> {/* Separator */}

        <label htmlFor="map-select" style={{fontWeight: 'bold'}}>Load Map:</label>
        <select
            id="map-select"
            value={currentMapId || "__NEW__"}
            onChange={handleMapSelectChange}
            style={{maxWidth: '250px', padding: '5px'}}
            disabled={!isLoggedIn} // Disable dropdown if not logged in
            title={!isLoggedIn ? "Log in to load saved maps" : ""}
        >
            <option value="__NEW__">[Untitled Map]</option>
            {isLoggedIn && mapList.map(map => ( // Only show list if logged in
                <option key={map.map_id} value={map.map_id}>
                    {map.map_name} ({new Date(map.last_updated).toLocaleDateString()})
                </option>
            ))}
        </select>
        <button onClick={handleNewMap} disabled={!isLoggedIn || saveStatus === "Creating new map..."} title={!isLoggedIn ? "Log in to create a new map" : "Create a new map"}>New Map</button>
        <button onClick={handleSave} disabled={!isLoggedIn || saveStatus === "Saving..."} title={!isLoggedIn ? "Log in to save changes" : "Save the current map"}>Save</button>
        <button onClick={handleDeleteMap} disabled={!isLoggedIn || !currentMapId || saveStatus === "Deleting..."} title={!isLoggedIn ? "Log in to delete maps" : "Delete the currently selected map"}>Delete</button>

        {saveStatus && <span style={{ fontSize: '0.9em', color: saveStatus.startsWith('Error') ? 'red' : (saveStatus.includes('log in') ? 'orange' : 'green') }}>{saveStatus}</span>}
      </div>
      {/* --- End Map Management Bar --- */}

      {/* --- Instructions Bar --- */}
      {/* Instructions are always visible */}
      <div style={{ padding: '5px 10px', borderBottom: '1px solid #eee', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.9em', color: '#555' }}>
        <button onClick={addNode} title="Add a new course node to the map">Add Course</button>
        <span>| Double-click to rename | Select + Backspace/Delete to remove | Drag handles to connect</span>
      </div>
       {/* --- End Instructions Bar --- */}

      <ReactFlow
        nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect} onNodeDoubleClick={onNodeDoubleClick} onEdgeDoubleClick={onEdgeDoubleClick}
        onPaneClick={onPaneClick} fitView attributionPosition="bottom-left"
        deleteKeyCode={['Backspace', 'Delete']} nodesDraggable={true} nodesConnectable={true} elementsSelectable={true}
        nodeTypes={nodeTypes} // Pass the nodeTypes object here
        // Prevent interaction if loading user data? Maybe not necessary.
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
      </ReactFlow>
      {/* Note about custom nodes remains the same */}
      <div style={{ padding: '5px', fontSize: '0.8em', color: '#666', borderTop: '1px solid #eee' }}>
         <strong>Note:</strong> To add multiple input/output handles, create a <a href="https://reactflow.dev/docs/guides/custom-nodes/" target="_blank" rel="noopener noreferrer">Custom Node component</a>.
       </div>
    </div>
  );
}

// Wrap with Provider
export default function CourseMap({ user }) { // Receive user prop
  return (
    <ReactFlowProvider>
      {/* Pass user down to the actual flow component */}
      <CourseMapFlow user={user} />
    </ReactFlowProvider>
  );
}