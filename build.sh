#!/bin/bash
echo "Starting build process..."
echo "Current directory: $(pwd)"
echo "Files in current directory:"
ls -la
echo "Installing dependencies..."
npm install
echo "Build completed successfully!" 