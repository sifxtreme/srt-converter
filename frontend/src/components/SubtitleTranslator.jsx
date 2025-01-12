import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Download, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { API_BASE_URL, API_ENDPOINTS } from '@/config';
import { setToken, removeToken } from '../lib/utils';


const SubtitleTranslator = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [currentSetId, setCurrentSetId] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.AUTH_STATUS}`, {
        credentials: 'include'
      });
      const data = await response.json();
      setIsAuthenticated(data.isAuthenticated);
      setUser(data.user);
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    console.log('Attempting login with:', { email }); // Don't log passwords!

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setToken(data.token); // Store the JWT token
        setUser(data.username);
        // Handle successful login (redirect, etc.)
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError('An error occurred during login');
    }
  };

  const handleLogout = () => {
    removeToken();
    setUser(null);
    // Handle logout (redirect, etc.)
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
          <h1 className="text-2xl font-bold text-center">Login</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            {loginError && (
              <div className="text-red-500 text-sm">{loginError}</div>
            )}
            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile?.name.endsWith('.srt')) {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('Please select an SRT file');
      setFile(null);
    }
  };

  const fetchOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('srt', file);

    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.UPLOAD}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to upload files');
        }
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setCurrentSetId(data.setId);
      setUploadPreview(data);
      return data;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  };

  const handleTranslate = async (setId) => {
    if (!setId) return;

    setTranslating(true);
    setProgress({ current: 0, total: 0 });

    // Set up SSE connection
    const eventSource = new EventSource(`${API_BASE_URL}/translation-progress/${setId}`, {
      withCredentials: true
    });

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data);

      if (data.completed) {
        eventSource.close();
        setTranslating(false);
        // Ensure the progress shows completion state
        setProgress({
          ...data,
          current: data.total,
          completed: true
        });
      }
    };

    // Start translation
    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.TRANSLATE(setId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to translate files');
        }
        throw new Error('Translation failed');
      }

      await response.json();
    } catch (error) {
      console.error('Translation error:', error);
      eventSource.close();
      setProgress(null);
      setTranslating(false);
      setError('Translation failed: ' + error.message);
    }
  };

  const handleDownload = async () => {
    if (!currentSetId) return;

    try {
      window.location.href = `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD(currentSetId)}`;
    } catch (err) {
      setError('Failed to download file: ' + err.message);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>SRT Translator</CardTitle>
          <CardDescription>Upload an SRT file to translate it to Spanish</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

        <div className="flex items-center justify-center w-full">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-8 h-8 mb-2 text-gray-500" />
              <p className="mb-2 text-sm text-gray-500">
                <span className="font-semibold">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-500">.srt files only</p>
            </div>
            <input
              type="file"
              className="hidden"
              accept=".srt"
              onChange={handleFileChange}
            />
          </label>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {file && (
          <div className="text-sm text-gray-500">
            Selected file: {file.name}
          </div>
        )}

        {uploadPreview && (
          <div className="mt-4 space-y-4 border-2 border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <div className="text-sm font-medium text-gray-700">
              Successfully uploaded {uploadPreview.totalSubtitles} subtitles
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">Preview:</div>
              <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
                {uploadPreview.preview.map((subtitle) => (
                  <div key={subtitle.index} className="space-y-1">
                    <div className="text-xs text-gray-500">
                      {subtitle.index} | {subtitle.timestamp}
                    </div>
                    <div className="text-sm text-gray-700">
                      {subtitle.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        </CardContent>

        <CardFooter className="flex justify-between items-center w-full">
          <div className="flex-1">
            <Button
              onClick={() => uploadFile(file)}
              disabled={!file || uploading}
            >
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </div>

          <div className="flex-1 flex justify-center">
            <Button
              onClick={() => handleTranslate(currentSetId)}
              disabled={!currentSetId || translating}
              variant="secondary"
            >
              {translating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Translate to Spanish
            </Button>
          </div>

          <div className="flex-1 flex justify-end">
            <Button
              onClick={handleDownload}
              disabled={!currentSetId}
              variant="outline"
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
        </CardFooter>

        {progress && (
          <div className="mt-4 p-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{
                  width: progress.total ? `${(progress.current / progress.total) * 100}%` : '0%'
                }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              {progress.completed ? (
                "Translation completed!"
              ) : (
                progress.total ?
                  `Translating: ${progress.current} of ${progress.total} subtitles` :
                  "Preparing translation..."
              )}
            </p>
          </div>
        )}
        </Card>
    </div>
  );
};

export default SubtitleTranslator;