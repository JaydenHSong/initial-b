const databaseName = 'moeum-palette-board';
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('palettes', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Storage is blocked'));
  });
}
export async function readPalettes() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('palettes', 'readonly');
    const request = transaction.objectStore('palettes').getAll();
    transaction.oncomplete = () => { database.close(); resolve(request.result.sort((a, b) => b.createdAt - a.createdAt)); };
    transaction.onabort = transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}
export async function savePalette(palette) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('palettes', 'readwrite');
    transaction.objectStore('palettes').put(palette);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onabort = transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}
