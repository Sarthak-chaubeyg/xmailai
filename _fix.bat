@echo off
set "GH=C:\Program Files\GitHub CLI\gh.exe"
cd "c:\Users\volta\web search"
git add -A
git commit -m "fix: blobs store and esbuild config for production"
git push origin master
echo DONE - EXIT CODE: %errorlevel%
