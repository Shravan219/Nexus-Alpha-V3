import { useState, useEffect } from 'react';

export function useVaulticGate() {
  const [isValidating, setIsValidating] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    async function checkLicense() {
      try {
        const response = await fetch('https://n-vaultic.vercel.app//api/verify-license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licenseKey: (import.meta as any).env.VITE_VAULTIC_LICENSE_KEY || ''
          }),
        });
        
        const data = await response.json();
        setIsAuthorized(data.valid);
      } catch (err) {
        setIsAuthorized(false); // Fail closed if offline or blocked
      } finally {
        setIsValidating(false);
      }
    }

    checkLicense();
  }, []);

  return { isValidating, isAuthorized };
}