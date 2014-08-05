SUBDIRS = images ext4 css manager bootstrap touch

all: ${SUBDIRS}

%:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

