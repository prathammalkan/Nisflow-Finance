"use client";

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const BIOMETRIC_KEY = 'nisflow_biometric_enabled';
const BIOMETRIC_CRED_ID = 'nisflow_biometric_cred_id';

export function useBiometricLock() {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check WebAuthn support
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(supported => setIsSupported(supported))
        .catch(() => setIsSupported(false));

      const enabled = localStorage.getItem(BIOMETRIC_KEY) === 'true';
      setIsEnabled(enabled);

      if (enabled) {
        setIsLocked(true);
      }
    }
  }, []);

  const enableBiometrics = async () => {
    if (!isSupported) {
      toast.error("Biometric authentication (Touch ID / Face ID / Fingerprint) is not supported on this device.");
      return false;
    }

    setLoading(true);
    try {
      // Challenge for WebAuthn registration
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const userId = new Uint8Array(16);
      window.crypto.getRandomValues(userId);

      const publicKey: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: "NisFlow Finance",
          id: window.location.hostname,
        },
        user: {
          id: userId,
          name: "nisflow_user",
          displayName: "NisFlow Account Owner",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },  // ES256
          { type: "public-key", alg: -257 } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform", // Touch ID / Face ID / Fingerprint
          userVerification: "required",
        },
        timeout: 60000,
      };

      const credential = (await navigator.credentials.create({
        publicKey,
      })) as PublicKeyCredential;

      if (credential) {
        localStorage.setItem(BIOMETRIC_KEY, 'true');
        localStorage.setItem(BIOMETRIC_CRED_ID, credential.id);
        setIsEnabled(true);
        setIsLocked(false);
        toast.success("Biometric App Lock enabled! Your account is now secured with Touch ID / Face ID.");
        return true;
      }
    } catch (err: any) {
      console.error("Biometric registration error:", err);
      toast.error(err.message || "Failed to register biometric credential.");
    } finally {
      setLoading(false);
    }
    return false;
  };

  const disableBiometrics = () => {
    localStorage.removeItem(BIOMETRIC_KEY);
    localStorage.removeItem(BIOMETRIC_CRED_ID);
    setIsEnabled(false);
    setIsLocked(false);
    toast.success("Biometric App Lock disabled.");
  };

  const authenticateBiometrics = useCallback(async (): Promise<boolean> => {
    if (!isEnabled) {
      setIsLocked(false);
      return true;
    }

    setLoading(true);
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const credIdStr = localStorage.getItem(BIOMETRIC_CRED_ID);

      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge,
        timeout: 60000,
        userVerification: "required",
      };

      if (credIdStr) {
        // Convert base64 / text string to Uint8Array if needed
        publicKey.allowCredentials = [
          {
            id: Uint8Array.from(atob(credIdStr.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
            type: 'public-key',
          }
        ];
      }

      const assertion = await navigator.credentials.get({ publicKey });

      if (assertion) {
        setIsLocked(false);
        toast.success("Identity verified! Welcome back.");
        return true;
      }
    } catch (err: any) {
      console.error("Biometric verification error:", err);
      // Fallback verification prompt or user cancellation
      toast.error("Biometric verification failed or cancelled.");
    } finally {
      setLoading(false);
    }
    return false;
  }, [isEnabled]);

  const lockApp = () => {
    if (isEnabled) {
      setIsLocked(true);
    }
  };

  return {
    isSupported,
    isEnabled,
    isLocked,
    loading,
    enableBiometrics,
    disableBiometrics,
    authenticateBiometrics,
    lockApp,
  };
}
