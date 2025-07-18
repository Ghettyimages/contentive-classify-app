import React from 'react';

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">
          Welcome to SignalSync
        </h1>
        <p className="text-gray-600 mt-2">
          Analyze how content context drives real performance.
        </p>
      </header>

      <section className="bg-white rounded-xl shadow p-6">
        <h2 className="text-xl font-semibold text-gray-700 mb-4">
          Upload Attribution Data
        </h2>

        <div className="mb-4">
          <input
            type="file"
            accept=".csv"
            className="border border-gray-300 rounded p-2"
          />
        </div>

        <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Analyze
        </button>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-700 mb-2">
          Coming Soon
        </h2>
        <ul className="list-disc list-inside text-gray-600">
          <li>View top-performing first-touch content</li>
          <li>Export contextual key-values for targeting</li>
          <li>Break down by category, tone, and intent</li>
        </ul>
      </section>
    </div>
  );
};

export default Dashboard;
