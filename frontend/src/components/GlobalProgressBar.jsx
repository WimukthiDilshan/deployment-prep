import React from 'react';

const steps = [
  { id: 1, title: 'Learner Profile' },
  { id: 2, title: 'Visual vs Verbal' },
  { id: 3, title: 'Analytic vs Wholistic' }
];

export default function GlobalProgressBar({ currentStep }) {
  return (
    <div style={{
      width: '100%',
      maxWidth: '840px',
      margin: '0 auto 2rem auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'relative'
    }}>
      {/* Background Line */}
      <div style={{
        position: 'absolute',
        top: '18px',
        left: '10%',
        right: '10%',
        height: '4px',
        background: 'rgba(59, 130, 246, 0.1)',
        zIndex: 0,
        borderRadius: '2px'
      }} />

      {/* Active Line */}
      <div style={{
        position: 'absolute',
        top: '18px',
        left: '10%',
        width: `${((currentStep - 1) / (steps.length - 1)) * 80}%`,
        height: '4px',
        background: 'linear-gradient(90deg, #7c3aed 0%, #2563eb 100%)',
        zIndex: 1,
        borderRadius: '2px',
        transition: 'width 0.5s ease-in-out'
      }} />

      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isCompleted = step.id < currentStep;

        return (
          <div key={step.id} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative',
            zIndex: 2,
            width: '120px'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: isActive || isCompleted ? '#ffffff' : '#f8fafc',
              border: isActive || isCompleted 
                ? '2px solid #2563eb' 
                : '2px solid rgba(59, 130, 246, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '600',
              fontSize: '0.9rem',
              color: isActive || isCompleted ? '#2563eb' : '#94a3b8',
              boxShadow: isActive ? '0 0 0 4px rgba(37, 99, 235, 0.1)' : 'none',
              transition: 'all 0.3s ease',
              marginBottom: '0.75rem'
            }}>
              {isCompleted ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                step.id
              )}
            </div>
            <span style={{
              fontSize: '0.8rem',
              fontWeight: isActive ? '600' : '500',
              color: isActive ? '#1e293b' : '#64748b',
              textAlign: 'center',
              transition: 'color 0.3s ease'
            }}>
              {step.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}
