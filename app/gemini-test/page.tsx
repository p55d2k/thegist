"use client";

import { useState } from "react";

export default function GeminiTestPage() {
  const [testResults, setTestResults] = useState<any>(null);
  const [debugResults, setDebugResults] = useState<any>(null);
  const [configResults, setConfigResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const runConfigTest = async (configType: string) => {
    setConfigLoading(true);
    setConfigError(null);
    setConfigResults(null);

    try {
      const response = await fetch("/api/gemini-config-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ configTest: configType }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "API call failed");
      }

      setConfigResults(data);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setConfigLoading(false);
    }
  };

  const runDebugTest = async (size: string) => {
    setDebugLoading(true);
    setDebugError(null);
    setDebugResults(null);

    try {
      const response = await fetch("/api/gemini-debug", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ testSize: size }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "API call failed");
      }

      setDebugResults(data);
    } catch (err) {
      setDebugError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDebugLoading(false);
    }
  };

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setTestResults(null);

    try {
      const response = await fetch("/api/gemini-test");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "API call failed");
      }

      setTestResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Gemini API Test</h1>

      <div className="mb-6">
        <button
          onClick={runTest}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 mr-4"
        >
          {loading ? "Testing..." : "Run Gemini Test"}
        </button>
      </div>

      <div className="mb-6">
        <h3 className="font-bold mb-2">Configuration Tests:</h3>
        <div className="flex gap-2 flex-wrap">
          {[
            "minimal",
            "basic",
            "simple",
            "noMimeType",
            "noMimeHighTokens",
            "noMimeLowTokens",
            "complexNoMime",
            "conservative",
            "default",
          ].map((config) => (
            <button
              key={config}
              onClick={() => runConfigTest(config)}
              disabled={configLoading}
              className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-3 rounded disabled:opacity-50 text-sm"
            >
              {configLoading ? "Testing..." : config}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Test different prompt and configuration combinations to isolate the
          empty response issue
        </p>
      </div>

      <div className="mb-6">
        <h3 className="font-bold mb-2">Newsletter Generation Debug Tests:</h3>
        <div className="flex gap-2 flex-wrap">
          {["tiny", "small", "medium", "large", "huge"].map((size) => (
            <button
              key={size}
              onClick={() => runDebugTest(size)}
              disabled={debugLoading}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-3 rounded disabled:opacity-50 text-sm"
            >
              {debugLoading ? "Testing..." : `Test ${size}`}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Test newsletter generation with different dataset sizes: tiny (5),
          small (10), medium (25), large (43), huge (60)
        </p>
      </div>

      {configError && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <h3 className="font-bold">Config Test Error:</h3>
          <p>{configError}</p>
        </div>
      )}

      {configResults && (
        <div className="mb-6 space-y-4">
          <div className="p-4 bg-purple-100 rounded">
            <h3 className="font-bold mb-2">Configuration Test Results:</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <p>
                <strong>Config Type:</strong> {configResults.configTest}
              </p>
              <p>
                <strong>Response Length:</strong> {configResults.responseLength}{" "}
                chars
              </p>
              <p>
                <strong>Prompt Length:</strong> {configResults.promptLength}{" "}
                chars
              </p>
              <p>
                <strong>Is Empty:</strong>{" "}
                {configResults.isEmpty ? "❌ Yes (PROBLEM!)" : "✅ No"}
              </p>
              <p>
                <strong>Has Response Object:</strong>{" "}
                {configResults.hasResponse ? "✅ Yes" : "❌ No"}
              </p>
            </div>

            {configResults.config && (
              <div className="mt-2">
                <strong>Config Used:</strong>
                <pre className="text-xs bg-white p-2 rounded mt-1 overflow-x-auto">
                  {JSON.stringify(configResults.config, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {configResults.rawResponse && (
            <div className="p-4 bg-gray-100 rounded">
              <h4 className="font-bold mb-2">Raw Response:</h4>
              <pre className="text-xs overflow-x-auto bg-white p-2 rounded max-h-48">
                {configResults.rawResponse}
              </pre>
            </div>
          )}
        </div>
      )}

      {debugError && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <h3 className="font-bold">Debug Test Error:</h3>
          <p>{debugError}</p>
        </div>
      )}

      {debugResults && (
        <div className="mb-6 space-y-4">
          <div className="p-4 bg-blue-100 rounded">
            <h3 className="font-bold mb-2">
              Newsletter Generation Test Results:
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <p>
                <strong>Test Size:</strong> {debugResults.testSize}
              </p>
              <p>
                <strong>Article Count:</strong> {debugResults.articleCount}
              </p>
              <p>
                <strong>Prompt Length:</strong>{" "}
                {debugResults.promptLength?.toLocaleString()} chars
              </p>
              <p>
                <strong>Dataset Size:</strong>{" "}
                {debugResults.datasetSize?.toLocaleString()} chars
              </p>
              <p>
                <strong>Response Length:</strong>{" "}
                {debugResults.responseLength?.toLocaleString()} chars
              </p>
              <p>
                <strong>Has Required Sections:</strong>{" "}
                {debugResults.hasRequiredSections ? "✅ Yes" : "❌ No"}
              </p>
            </div>
          </div>

          {debugResults.rawResponse && (
            <div className="p-4 bg-gray-100 rounded">
              <h4 className="font-bold mb-2">Raw Response Preview:</h4>
              <pre className="text-xs overflow-x-auto bg-white p-2 rounded">
                {debugResults.rawResponse}
              </pre>
            </div>
          )}

          {debugResults.parsedResponse && (
            <div className="p-4 bg-green-100 rounded">
              <h4 className="font-bold mb-2">Parsed Response Structure:</h4>
              <pre className="text-xs overflow-x-auto bg-white p-2 rounded max-h-96">
                {JSON.stringify(debugResults.parsedResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <h3 className="font-bold">Error:</h3>
          <p>{error}</p>
        </div>
      )}

      {testResults && (
        <div className="space-y-6">
          <div className="p-4 bg-gray-100 rounded">
            <h3 className="font-bold mb-2">API Configuration:</h3>
            <p>
              API Key Present: {testResults.apiKeyPresent ? "✅ Yes" : "❌ No"}
            </p>
            <p>API Key Length: {testResults.apiKeyLength} characters</p>
          </div>

          <div>
            <h3 className="font-bold mb-4">Model Test Results:</h3>
            <div className="space-y-4">
              {testResults.results?.map((result: any, index: number) => (
                <div key={index} className="border rounded p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold">{result.model}</h4>
                    <span
                      className={`px-2 py-1 rounded text-sm ${
                        result.status === "success"
                          ? "bg-green-100 text-green-800"
                          : result.status === "json_parse_error"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {result.status}
                    </span>
                  </div>

                  {result.error && (
                    <div className="mb-2 p-2 bg-red-50 rounded">
                      <strong>Error:</strong> {result.error}
                    </div>
                  )}

                  {result.rawResponse && (
                    <div className="mb-2">
                      <strong>Raw Response:</strong>
                      <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                        {result.rawResponse}
                      </pre>
                    </div>
                  )}

                  {result.parsedResponse && (
                    <div>
                      <strong>Parsed Response:</strong>
                      <pre className="mt-1 p-2 bg-green-50 rounded text-xs overflow-x-auto">
                        {JSON.stringify(result.parsedResponse, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
