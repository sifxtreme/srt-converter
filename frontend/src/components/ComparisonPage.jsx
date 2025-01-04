import React, { useState } from 'react';
import * as Form from '@radix-ui/react-form';
import * as Progress from '@radix-ui/react-progress';
import * as Tabs from '@radix-ui/react-tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { API_BASE_URL } from '@/config';

const ComparisonPage = () => {
  const [sourceFile, setSourceFile] = useState(null);
  const [targetFile, setTargetFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAnalysis = async () => {
    if (!sourceFile || !targetFile) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('sourceSRT', sourceFile);
    formData.append('targetSRT', targetFile);

    try {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const result = await response.json();
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">SRT Translation Analyzer</h1>

      <Form.Root className="space-y-8">
        <Form.Field name="sourceSRT">
          <div className="flex items-baseline justify-between">
            <Form.Label className="text-sm font-medium">
              Source SRT File (English)
            </Form.Label>
            <Form.Message className="text-xs text-red-500" match="valueMissing">
              Please select a source file
            </Form.Message>
          </div>
          <Form.Control asChild>
            <input
              type="file"
              accept=".srt"
              onChange={(e) => setSourceFile(e.target.files?.[0] || null)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            />
          </Form.Control>
        </Form.Field>

        <Form.Field name="targetSRT">
          <div className="flex items-baseline justify-between">
            <Form.Label className="text-sm font-medium">
              Target SRT File (Spanish)
            </Form.Label>
            <Form.Message className="text-xs text-red-500" match="valueMissing">
              Please select a target file
            </Form.Message>
          </div>
          <Form.Control asChild>
            <input
              type="file"
              accept=".srt"
              onChange={(e) => setTargetFile(e.target.files?.[0] || null)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            />
          </Form.Control>
        </Form.Field>

        <Form.Submit asChild>
          <button
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            disabled={!sourceFile || !targetFile || loading}
            onClick={handleAnalysis}
          >
            {loading ? 'Analyzing...' : 'Analyze Translation'}
          </button>
        </Form.Submit>
      </Form.Root>

      {loading && (
        <div className="mt-6">
          <Progress.Root className="h-2 overflow-hidden bg-gray-200 rounded-full">
            <Progress.Indicator
              className="h-full bg-blue-600 transition-transform duration-300 ease-in-out"
              style={{ transform: 'translateX(-100%)' }}
            />
          </Progress.Root>
          <p className="text-sm text-center mt-2">Analyzing translations...</p>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {analysis && (
        <Tabs.Root className="mt-8" defaultValue="overview">
          <Tabs.List className="flex border-b">
            <Tabs.Trigger
              value="overview"
              className="px-4 py-2 -mb-px border-b-2 border-transparent data-[state=active]:border-blue-600"
            >
              Overview
            </Tabs.Trigger>
            <Tabs.Trigger
              value="issues"
              className="px-4 py-2 -mb-px border-b-2 border-transparent data-[state=active]:border-blue-600"
            >
              Issues
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="overview" className="py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold mb-2">Overall Score</h3>
                <p className="text-3xl font-bold text-blue-600">
                  {analysis.overallScore.toFixed(1)}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold mb-2">Individual Scores</h3>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm">Accuracy</label>
                    <Progress.Root className="h-2 overflow-hidden bg-gray-200 rounded-full">
                      <Progress.Indicator
                        className="h-full bg-green-600 transition-transform duration-300 ease-in-out"
                        style={{
                          transform: `translateX(-${100 - analysis.scores.accuracy}%)`,
                        }}
                      />
                    </Progress.Root>
                    <span className="text-sm">{analysis.scores.accuracy.toFixed(1)}%</span>
                  </div>
                  <div>
                    <label className="text-sm">Naturalness</label>
                    <Progress.Root className="h-2 overflow-hidden bg-gray-200 rounded-full">
                      <Progress.Indicator
                        className="h-full bg-blue-600 transition-transform duration-300 ease-in-out"
                        style={{
                          transform: `translateX(-${100 - analysis.scores.naturalness}%)`,
                        }}
                      />
                    </Progress.Root>
                    <span className="text-sm">{analysis.scores.naturalness.toFixed(1)}%</span>
                  </div>
                  <div>
                    <label className="text-sm">Completeness</label>
                    <Progress.Root className="h-2 overflow-hidden bg-gray-200 rounded-full">
                      <Progress.Indicator
                        className="h-full bg-purple-600 transition-transform duration-300 ease-in-out"
                        style={{
                          transform: `translateX(-${100 - analysis.scores.completeness}%)`,
                        }}
                      />
                    </Progress.Root>
                    <span className="text-sm">{analysis.scores.completeness.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="issues" className="py-4">
            <div className="space-y-4">
              {analysis.issues.map((issue, index) => (
                <div
                  key={index}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">Index {issue.index}</span>
                    <span className="text-sm px-2 py-1 bg-gray-200 rounded">
                      {issue.type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{issue.reason}</p>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">Source</label>
                      <p className="text-sm">{issue.source}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Target</label>
                      <p className="text-sm">{issue.target}</p>
                    </div>
                    {issue.suggestion && (
                      <div>
                        <label className="text-xs text-gray-500">Suggestion</label>
                        <p className="text-sm">{issue.suggestion}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Tabs.Content>
        </Tabs.Root>
      )}
    </div>
  );
};

export default ComparisonPage;