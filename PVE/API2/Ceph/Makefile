include ../../../defines.mk

PERLSOURCE= 			\
	Cfg.pm 			\
	MGR.pm			\
	MON.pm			\
	OSD.pm			\
	FS.pm			\
	Pool.pm			\
	MDS.pm

all:

.PHONY: clean
clean:
	rm -rf *~

.PHONY: install
install: $(PERLSOURCE)
	install -d $(PERLLIBDIR)/PVE/API2/Ceph
	install -m 0644 $(PERLSOURCE) $(PERLLIBDIR)/PVE/API2/Ceph
