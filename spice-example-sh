#!/bin/bash

set -e

# needs pve-manager >= 3.1-44

usage() { 
    echo "Usage: $0 [-u <string>] [-p <string>] vmid [node [proxy]]"
    echo
    echo "-u username. Default root@pam"
    echo "-p password. Default ''"
    echo
    echo "vmid: id for VM"
    echo "node: Proxmox cluster node name"
    echo "proxy: DNS or IP (use <node> as default)"
    exit 1
}

PASSWORD=""
USERNAME=""

while getopts ":u:p:" o; do
    case "${o}" in
        u)
            USERNAME="${OPTARG}"
            ;;
        p)
            PASSWORD="${OPTARG}"
            ;;
        *)
            usage
            ;;
    esac
done

shift $((OPTIND-1))

if [[ -z "$PASSWORD" ]]; then
    PASSWORD=""
fi
if [[ -z "$USERNAME" ]]; then
    USERNAME='root@pam'
fi

DEFAULTHOST="$(hostname -f)"

# select VM
[[ -z "$1" ]] && usage
VMID="$1"

#[[ -z "$2" ]] && usage
NODE="${2:-$DEFAULTHOST}"

if [[ -z "$3" ]]; then
    PROXY="$NODE"
else
    PROXY="$3"
fi

NODE="${NODE%%\.*}"

DATA="$(curl -f -s -S -k --data-urlencode "username=$USERNAME" --data-urlencode "password=$PASSWORD" "https://$PROXY:8006/api2/json/access/ticket")"

echo "AUTH OK"

TICKET="${DATA//\"/}"
TICKET="${TICKET##*ticket:}"
TICKET="${TICKET%%,*}"
TICKET="${TICKET%%\}*}"

CSRF="${DATA//\"/}"
CSRF="${CSRF##*CSRFPreventionToken:}"
CSRF="${CSRF%%,*}"
CSRF="${CSRF%%\}*}"

curl -f -s -S -k -b "PVEAuthCookie=$TICKET" -H "CSRFPreventionToken: $CSRF" "https://$PROXY:8006/api2/spiceconfig/nodes/$NODE/qemu/$VMID/spiceproxy" -d "proxy=$PROXY" > spiceproxy

exec remote-viewer spiceproxy
