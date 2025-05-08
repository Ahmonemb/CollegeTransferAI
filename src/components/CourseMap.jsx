import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'; 
import ReactFlow, {
  Controls, Background, addEdge, MiniMap, BackgroundVariant,
  ReactFlowProvider, useReactFlow, useNodesState, useEdgesState,
  Position 
} from 'reactflow';
import 'reactflow/dist/style.css';
import { fetchData } from '../services/api';
import CustomCourseNode from './CustomCourseNode'; 

const defaultNodes = []; 
const defaultEdges = [];

let idCounter = 0; 
const getUniqueNodeId = () => `new_node_${idCounter++}`;

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

const getCacheKey = (base, userId, mapId = null) => {
    if (!userId) return null; 
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
        localStorage.removeItem(key); 
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


function CourseMapFlow({ user }) { 
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);
  const [editingElement, setEditingElement] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');

  const [mapList, setMapList] = useState([]); 
  const [currentMapId, setCurrentMapId] = useState(null); 
  const [currentMapName, setCurrentMapName] = useState('Untitled Map'); 
  const [isMapListLoading, setIsMapListLoading] = useState(true);

  const isLoggedIn = !!user; 

  const userId = user?.id; 

  const loadMapList = useCallback(async (forceRefresh = false) => {
    const cacheKey = getCacheKey('courseMapList', userId);
    if (!isLoggedIn) {
        setMapList([]);
        setIsMapListLoading(false);
        return [];
    }

    if (!forceRefresh) {
        const cachedList = loadFromCache(cacheKey);
        if (cachedList && Array.isArray(cachedList)) { 
            setMapList(cachedList);
            setIsMapListLoading(false);
            return cachedList;
        } else if (cachedList) {
            console.warn("Cached map list was not an array, removing:", cachedList);
            removeFromCache(cacheKey); 
        }
    }

    setIsMapListLoading(true);
    try {
      console.log("Fetching map list from API...");
      const responseData = await fetchData('course-maps', { 
        headers: { 'Authorization': `Bearer ${user.idToken}` }
      });
      console.log("Raw API response for map list:", responseData); 

      const validList = Array.isArray(responseData) ? responseData : [];
      if (!Array.isArray(responseData)) {
          console.warn("API response for map list was not an array:", responseData);
      }

      setMapList(validList);
      saveToCache(cacheKey, validList); 
      console.log("Map list fetched and cached:", validList);
      return validList;
    } catch (error) {
      console.error("Failed to load map list:", error);
      setSaveStatus(`Error loading map list: ${error.message}`);
      setMapList([]); 
      removeFromCache(cacheKey); 
      return [];
    } finally {
      setIsMapListLoading(false);
    }
  }, [userId, user?.idToken, isLoggedIn]); 

  const handleNewMap = useCallback(async () => {
    if (!isLoggedIn) {
      setSaveStatus("Please log in to create a new map.");
      return;
    }

    const mapName = prompt("Enter a name for the new map:", "Untitled Map");
    if (mapName === null) { 
      setSaveStatus(''); 
      return;
    }
    console.log("Initiating new map creation via API...");
    setIsLoading(true); 
    setSaveStatus("Creating new map...");

    try {
      const newMapData = await fetchData('course-map', { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.idToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
            map_name: mapName,
            nodes: [], 
            edges: []  
        })
      });

      if (newMapData && newMapData.map_id) {
        console.log("New map record created:", newMapData);

        const newMapEntry = {
          map_id: newMapData.map_id,
          map_name: newMapData.map_name || mapName, 
          last_updated: newMapData.last_updated || new Date().toISOString() 
        };
        setMapList(prevList => {
          const newList = [newMapEntry, ...prevList];
          newList.sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated));
          const listCacheKey = getCacheKey('courseMapList', userId);
          saveToCache(listCacheKey, newList); 
          return newList;
        });

        setNodes(defaultNodes); 
        setEdges(defaultEdges);
        setCurrentMapId(newMapData.map_id); 
        setCurrentMapName(newMapEntry.map_name); 
        idCounter = 0; 

        const mapCacheKey = getCacheKey('courseMap', userId, newMapData.map_id);
        saveToCache(mapCacheKey, { 
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

    } catch (error) {
      console.error("Failed to create new map:", error);
      setSaveStatus(`Error creating map: ${error.message}`);
    } finally {
      setIsLoading(false); 
    }
  }, [userId, user?.idToken, setNodes, setEdges, setMapList, isLoggedIn]); 

  const loadSpecificMap = useCallback(async (mapId, forceRefresh = false) => {
    const cacheKey = getCacheKey('courseMap', userId, mapId);

    if (!isLoggedIn) {
      setNodes(defaultNodes);
      setEdges(defaultEdges);
      setCurrentMapId(null);
      setCurrentMapName('Untitled Map');
      idCounter = 0;
      setIsLoading(false);
      setSaveStatus(''); 
      return;
    }

    if (!userId || !mapId) { 
      setNodes(defaultNodes);
      setEdges(defaultEdges);
      setCurrentMapId(null);
      setCurrentMapName('Untitled Map');
      idCounter = 0;
      setIsLoading(false);
      setSaveStatus(''); 
      return;
    }

    setIsLoading(true);
    setSaveStatus('');

    if (!forceRefresh) {
        const cachedMap = loadFromCache(cacheKey);
        if (cachedMap && cachedMap.nodes && cachedMap.edges) {
            const loadedNodes = cachedMap.nodes.map(node => ({
                ...node,
                type: node.type || 'courseNode' 
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
            return; 
        }
    }

    console.log(`Fetching map data for ID: ${mapId} from API...`);
    try {
      const data = await fetchData(`course-map/${mapId}`, {
        headers: { 'Authorization': `Bearer ${user.idToken}` }
      });
      if (data && data.nodes && data.edges) {
        console.log("Loaded map data from API:", data);
        const loadedNodes = data.nodes.map(node => ({
            ...node,
            type: node.type || 'courseNode' 
        }));
        setNodes(loadedNodes);
        setEdges(data.edges);
        setCurrentMapId(data.map_id);
        setCurrentMapName(data.map_name || 'Untitled Map');
        idCounter = data.nodes.reduce((maxId, node) => {
            const match = node.id.match(/^new_node_(\d+)$/);
            return match ? Math.max(maxId, parseInt(match[1], 10) + 1) : maxId;
        }, data.nodes.length);
        saveToCache(cacheKey, data); 
      } else {
        console.warn(`Map ${mapId} not found or invalid data from API.`);
        setSaveStatus(`Error: Map ${mapId} not found.`);
        removeFromCache(cacheKey); 
        handleNewMap(); 
      }
    } catch (error) {
      console.error(`Failed to load course map ${mapId}:`, error);
      setSaveStatus(`Error loading map: ${error.message}`);
      removeFromCache(cacheKey); 
      handleNewMap(); 
    } finally {
      setIsLoading(false);
    }
  }, [userId, user?.idToken, setNodes, setEdges, handleNewMap, isLoggedIn]); 

  useEffect(() => {
    setIsLoading(true); 
    if (isLoggedIn) {
        loadMapList().then((list) => {
            if (list && list.length > 0) {
                loadSpecificMap(list[0].map_id);
            } else {
                loadSpecificMap(null); 
            }
        });
    } else {
        loadSpecificMap(null);
    }
  }, [loadMapList, loadSpecificMap, isLoggedIn]); 

  const handleSave = useCallback(async () => {
    if (!isLoggedIn) {
      setSaveStatus("Please log in to save changes.");
      return;
    }
    setSaveStatus("Saving...");
    console.log(`Attempting to save map: ${currentMapId || '(new)'}`);

    const isNewMapInitially = !currentMapId;

    let mapNameToSave = currentMapName;
    if (currentMapName === 'Untitled Map') {
        const newName = prompt("Enter a name for this map:", currentMapName);
        if (newName === null) { 
            setSaveStatus(''); 
            return;
        }
        mapNameToSave = newName.trim() || 'Untitled Map'; 
        setCurrentMapName(mapNameToSave); 
    }

    if (!currentMapId) {
      console.error("Save attempted without a currentMapId. Please create a new map first.");
      setSaveStatus("Error: Cannot save, no map selected/created.");
      return;
    }

    try {
      const payload = {
        nodes,
        edges,
        map_name: mapNameToSave, 
        map_id: currentMapId 
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
      const savedMapId = result?.map_id; 

      if (savedMapId) {
        setCurrentMapId(savedMapId); 

        const mapCacheKey = getCacheKey('courseMap', userId, savedMapId);
        const updatedMapData = {
             nodes,
             edges,
             map_id: savedMapId,
             map_name: mapNameToSave,
             last_updated: new Date().toISOString() 
         };
        saveToCache(mapCacheKey, updatedMapData);

        if (isNewMapInitially) {
            const newMapEntry = {
                map_id: savedMapId,
                map_name: mapNameToSave,
                last_updated: updatedMapData.last_updated 
            };
            setMapList(prevList => {
                const newList = [newMapEntry, ...prevList];
                newList.sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated));
                const listCacheKey = getCacheKey('courseMapList', userId);
                saveToCache(listCacheKey, newList);
                return newList;
            });
        } else {
             loadMapList(true); 
        }

      } else if (!isNewMapInitially) {
          loadMapList(true);
      }


      setTimeout(() => setSaveStatus(''), 2000);
    } catch (error) {
      console.error("Failed to save course map:", error);
      setSaveStatus(`Error saving map: ${error.message}`);
    }
  }, [userId, user?.idToken, nodes, edges, currentMapId, currentMapName, loadMapList, setMapList, isLoggedIn]); 
  

  const handleMapSelectChange = (event) => {
    if (!isLoggedIn) {
        loadSpecificMap(null);
        return;
    }
    const selectedId = event.target.value;
    if (selectedId === "__NEW__") {
        console.log("Selected [Untitled Map], resetting view.");
        loadSpecificMap(null);
    } else {
        loadSpecificMap(selectedId);
    }
  };

    const handleDeleteMap = useCallback(async () => {
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

      const mapToDeleteId = currentMapId; 
      const mapCacheKey = getCacheKey('courseMap', userId, mapToDeleteId);
      const listCacheKey = getCacheKey('courseMapList', userId); 

      console.log(`[Delete Attempt] User ID: ${userId}, Map ID: ${mapToDeleteId}`);
      setSaveStatus("Deleting...");

      try {
          await fetchData(`course-map/${mapToDeleteId}`, {
              method: 'DELETE',
              headers: {
                  'Authorization': `Bearer ${user.idToken}`
              }
          });

          console.log("Map deleted successfully from backend.");
          setSaveStatus("Map deleted.");

          removeFromCache(mapCacheKey);

          let nextMapIdToLoad = null;
          setMapList(prevList => {
              const newList = prevList.filter(map => map.map_id !== mapToDeleteId);
              if (newList.length > 0) {
                  newList.sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated)); 
                  nextMapIdToLoad = newList[0].map_id;
              }
              saveToCache(listCacheKey, newList); 
              return newList;
          });

          if (nextMapIdToLoad) {
              loadSpecificMap(nextMapIdToLoad);
          } else {
              setNodes(defaultNodes);
              setEdges(defaultEdges);
              setCurrentMapId(null);
              setCurrentMapName('Untitled Map');
              idCounter = 0;
          }

          setTimeout(() => setSaveStatus(''), 2000);

      } catch (error) {
          console.error(`[Delete Failed] User ID: ${userId}, Map ID: ${mapToDeleteId}`, error);
          setSaveStatus(`Error deleting map: ${error.message}`);
          loadMapList(true);
      }
  }, [userId, user?.idToken, currentMapId, currentMapName, loadMapList, loadSpecificMap, setMapList, setNodes, setEdges, isLoggedIn]);


   const onConnect = useCallback((connection) => {
       const newEdge = { ...connection, label: 'Prereq' };
       setEdges((eds) => addEdge(newEdge, eds));
     }, [setEdges]);

   const addNode = useCallback(() => {
     const newNodeId = getUniqueNodeId();
     const position = screenToFlowPosition({
       x: reactFlowWrapper.current.clientWidth / 2,
       y: reactFlowWrapper.current.clientHeight / 3,
     });
     const newNode = {
       id: newNodeId,
       type: 'courseNode', 
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

  const nodeTypes = useMemo(() => ({
      courseNode: CustomCourseNode, 
  }), []);

  if (isMapListLoading || isLoading) {
    if (isLoggedIn) {
        return <p>Loading course maps...</p>;
    }
  }

  return (
    <div style={{ height: 'calc(100vh - 60px)', width: '100%', border: '1px solid #ccc', position: 'relative' }} ref={reactFlowWrapper}>
      {editingElement && <EditInput element={editingElement} value={editValue} onChange={handleEditChange} onSave={saveEdit} />}

      {!isLoggedIn && (
        <div style={{ padding: '10px', background: '#fff3cd', color: '#856404', borderBottom: '1px solid #ffeeba', textAlign: 'center', fontWeight: 'bold' }}>
          Please log in to save your course map or access saved maps.
        </div>
      )}

      <div style={{ padding: '10px', borderBottom: '1px solid #eee', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', background: '#f8f8f8' }}>
        <span style={{fontWeight: 'bold'}}>Editing:</span>
        <span style={{ fontStyle: currentMapId || !isLoggedIn ? 'italic' : 'normal' }}>
            {currentMapName} {currentMapId || !isLoggedIn ? '(unsaved)' : ''}
        </span>
        <span style={{margin: '0 5px'}}>|</span> 

        <label htmlFor="map-select" style={{fontWeight: 'bold'}}>Load Map:</label>
        <select
            id="map-select"
            value={currentMapId || "__NEW__"}
            onChange={handleMapSelectChange}
            style={{maxWidth: '250px', padding: '5px'}}
            disabled={!isLoggedIn} 
            title={!isLoggedIn ? "Log in to load saved maps" : ""}
        >
            <option value="__NEW__">[Untitled Map]</option>
            {isLoggedIn && mapList.map(map => ( 
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

      <div style={{ padding: '5px 10px', borderBottom: '1px solid #eee', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.9em', color: '#555' }}>
        <button onClick={addNode} title="Add a new course node to the map">Add Course</button>
        <span>| Double-click to rename | Select + Backspace/Delete to remove | Drag handles to connect</span>
      </div>

      <ReactFlow
        nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect} onNodeDoubleClick={onNodeDoubleClick} onEdgeDoubleClick={onEdgeDoubleClick}
        onPaneClick={onPaneClick} fitView attributionPosition="bottom-left"
        deleteKeyCode={['Backspace', 'Delete']} nodesDraggable={true} nodesConnectable={true} elementsSelectable={true}
        nodeTypes={nodeTypes} 
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
      </ReactFlow>
      <div style={{ padding: '5px', fontSize: '0.8em', color: '#666', borderTop: '1px solid #eee' }}>
         <strong>Note:</strong> To add multiple input/output handles, create a <a href="https://reactflow.dev/docs/guides/custom-nodes/" target="_blank" rel="noopener noreferrer">Custom Node component</a>.
       </div>
    </div>
  );
}

export default function CourseMap({ user }) { 
  return (
    <ReactFlowProvider>
      <CourseMapFlow user={user} />
    </ReactFlowProvider>
  );
}