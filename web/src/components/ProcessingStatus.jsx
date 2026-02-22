import React, { useState, useEffect } from 'react';

const ProcessingStatus = () => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    { icon: '📤', text: 'Uploading file...' },
    { icon: '👁️', text: 'Analyzing with vision model...' },
    { icon: '📐', text: 'Extracting AR components...' },
    { icon: '🤖', text: 'Generating AI summary...' },
    { icon: '✅', text: 'Complete!' },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < steps.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <div className="processing-status">
      <div className="spinner"></div>
      <h2>Processing Document...</h2>
      <ul className="processing-steps">
        {steps.map((step, idx) => (
          <li
            key={idx}
            className={`processing-step ${
              idx < currentStep ? 'complete' : idx === currentStep ? 'active' : ''
            }`}
          >
            <span className="step-icon">{step.icon}</span>
            <span className="step-text">{step.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ProcessingStatus;