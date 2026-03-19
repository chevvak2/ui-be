#!/bin/sh
set -e

usage()
{
    echo "$0 -b <be-branch-name> -f <fe-branch-name> [-i <image_name>] [-t <target_stage>]"
    exit 1
}

if [ $# -lt 4 ]; then
    usage
fi

# defaults
image_name="translator-app"
target_stage="cron"  # default stage

# parse args
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

# allow env override
target_stage=${TARGET_STAGE:-$target_stage}

echo "fe-branch: $fe_branch; be_branch: $be_branch; image_name: $image_name; target: $target_stage"

# save current branch
save_branch=$(git branch --show-current)

# checkout backend
echo "Checking out be-branch $be_branch"
git checkout "$be_branch"
git pull
be_tag=$(git rev-parse --short HEAD)

# clone frontend
./build-fe.sh "$fe_branch" no
cd ui-fe
fe_tag=$(git rev-parse --short HEAD)

# version tag
timestamp=$(date -u "+%Y.%m.%d_%H.%M.%SZ")
version_tag="FE.${fe_tag}_BE.${be_tag}_$timestamp"
version_tag=$(echo "$version_tag" | tr '*' '_')

# inject FE metadata
echo "VITE_BUILD_INFO=$version_tag" > .env
cd ..

# build Docker
echo "Building Docker image with target: $target_stage"
docker build --no-cache --target "$target_stage" -t "$image_name:$version_tag" -t "$image_name" .

echo "Docker image built: $image_name:$version_tag"

# restore branch safely
if [ -n "$save_branch" ]; then
    echo "Restoring branch $save_branch"
    git checkout "$save_branch"
else
    echo "No branch to restore (detached HEAD)"
fi
