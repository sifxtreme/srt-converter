import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Download, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { API_BASE_URL } from '@/config';

const SubtitleTranslator = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [currentSetId, setCurrentSetId] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);

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

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('srt', file);

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setCurrentSetId(data.setId);
      setUploadPreview(data);
    } catch (err) {
      setError('Failed to upload file: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleTranslate = async (setId) => {
    if (!setId) return;

    setTranslating(true);
    setProgress({ current: 0, total: 0 });

    // Set up SSE connection
    const eventSource = new EventSource(`${API_BASE_URL}/translation-progress/${setId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data);

      if (data.completed) {
        eventSource.close();
        setTranslating(false);
      }
    };

    // Start translation
    try {
      const response = await fetch(`${API_BASE_URL}/translate/${setId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Translation failed');
      }
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
      window.location.href = `${API_BASE_URL}/download/${currentSetId}`;
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
            <div className="mt-4 space-y-4">
              <div className="text-sm font-medium text-gray-700">
                Successfully uploaded {uploadPreview.totalSubtitles} subtitles
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">Preview:</div>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
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

        <CardFooter className="flex justify-between">
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Upload
          </Button>

          <Button
            onClick={() => handleTranslate(currentSetId)}
            disabled={!currentSetId || translating}
            variant="secondary"
          >
            {translating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Translate to Spanish
          </Button>

          <Button
            onClick={handleDownload}
            disabled={!currentSetId}
            variant="outline"
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </CardFooter>

        {progress && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Translating: {progress.current} of {progress.total} subtitles
              {progress.completed && " - Complete!"}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default SubtitleTranslator;