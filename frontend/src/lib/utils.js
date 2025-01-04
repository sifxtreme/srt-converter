import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { API_BASE_URL } from "../config"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export const fetchWithCredentials = (url, options = {}) => {
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
      'Content-Type': 'application/json',
    },
  });
};

export async function fetchWithAuth(endpoint, options = {}) {
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Handle unauthorized error
      throw new Error('Please log in to continue');
    }
    const error = await response.json();
    throw new Error(error.message || 'An error occurred');
  }

  return response.json();
}