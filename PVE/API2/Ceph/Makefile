include ../../../defines.mk

PERLSOURCE= 			\
	MGR.pm			\
	MON.pm			\
	OSD.pm			\
	FS.pm			\
	Pool.pm			\
	Pools.pm		\
	MDS.pm

all:

.PHONY: clean
clean:
	rm -rf *~

.PHONY: install
install: ${PERLSOURCE}
	install -d ${PERLLIBDIR}/PVE/API2/Ceph
	install -m 0644 ${PERLSOURCE} ${PERLLIBDIR}/PVE/API2/Ceph
