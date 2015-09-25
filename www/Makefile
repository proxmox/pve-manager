# Note: please add ext5 for extJS 5 development
SUBDIRS = images ext4 css manager bootstrap touch mobile

all: ${SUBDIRS}

%:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

