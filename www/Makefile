SUBDIRS = templates images ext4 css manager

all: ${SUBDIRS}

%:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

