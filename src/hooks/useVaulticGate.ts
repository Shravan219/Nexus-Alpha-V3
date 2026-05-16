// src/hooks/useVaulticGate.ts
import { useState, useEffect } from 'react';

export function useVaulticGate() {
  const [isValidating, setIsValidating] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    async function checkLicense() {
      try {
        // Use the global master URL or fallback to the local proxy
        const apiUrl = import.meta.env.VITE_VAULTIC_API_URL || '/api/verify-license';
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            license_key: import.meta.env.VITE_VAULTIC_LICENSE_KEY,
            domain: window.location.hostname
          }),
        });

        const data = await response.json();
        setIsAuthorized(data.valid === true);
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