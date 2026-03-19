#!/bin/sh

set -e

usage()
{
echo "$0 -b <be-branch-name> -f <fe-branch-name> [-i <image_name>] [-t <target_stage>]"
exit 1
}

if [ $# -lt 4 ]; then
usage
exit 1
fi

image_name="translator-app"
target_stage="cron"  # default stage

while getopts 'b:f:i:t:' opt
do
case $opt in
b) be_branch="$OPTARG" ;;
f) fe_branch="$OPTARG" ;;
i) image_name="$OPTARG" ;;
t) target_stage="$OPTARG" ;;
?) usage ;;
esac
done

echo "fe-branch: $fe_branch; be_branch: $be_branch; image_name: $image_name; target: $target_stage"

# Save current branch

save_branch=$(git branch --show-current)

echo "Checking out be-branch $be_branch"
git checkout "$be_branch"
git pull

be_tag=$(git rev-parse --short HEAD)

# Clone FE (no build here)

./build-fe.sh "$fe_branch" no

cd ui-fe
fe_tag=$(git rev-parse --short HEAD)
timestamp=$(date -u "+%Y.%m.%dt%H.%M.%Sz")
version_tag="FE.${fe_tag}*BE.${be_tag}*$timestamp"

# Inject build metadata

echo "VITE_BUILD_INFO=$version_tag" > .env

cd ..

echo "Building Docker image with target: $target_stage"

docker build --no-cache 
--target "$target_stage" 
-t "$image_name:$version_tag" 
-t "$image_name" .

echo "Docker image built: $image_name:$version_tag"

echo "Restoring branch $save_branch"
git checkout "$save_branch"
