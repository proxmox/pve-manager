SUBDIRS = images ext6 css manager6 touch mobile

all: ${SUBDIRS}

%:
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

