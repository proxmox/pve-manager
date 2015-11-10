# Note: please add ext6 for extJS 6 development
SUBDIRS = images ext4 css manager bootstrap touch mobile

all: ${SUBDIRS}

%:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

