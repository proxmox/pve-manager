RELEASE=2.0

man1dir = "/usr/share/man/man1"
man7dir = "/usr/share/man/man7"


%.1: %
	pod2man -n $* -s 1 -r "proxmox 1.0" -c "Proxmox Documentation" <$* >$*.1
