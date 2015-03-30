SUBDIRS = images ext4 ext5 css manager bootstrap touch mobile

all: ${SUBDIRS}

%:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

