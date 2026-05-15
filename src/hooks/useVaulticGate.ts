// src/hooks/useVaulticGate.ts
import { useState, useEffect } from 'react';

export function useVaulticGate() {
  const [isValidating, setIsValidating] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    async function checkLicense() {
      try {
        // Absolute simplicity: hits the Vercel serverless route directly on the same domain
        const response = await fetch('/api/verify-license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licenseKey: import.meta.env.VITE_VAULTIC_LICENSE_KEY,
          }),
        });

        const data = await response.json();
        setIsAuthorized(data.valid);
      } catch (err) {
        setIsAuthorized(false); // Default to lockdown state if network fails
      } finally {
        setIsValidating(false);
      }
    }

    checkLicense();
  }, []);

  return { isValidating, isAuthorized };
}