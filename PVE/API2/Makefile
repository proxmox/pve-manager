include ../../defines.mk

PERLSOURCE = 			\
	Replication.pm		\
	ReplicationConfig.pm	\
	Ceph.pm			\
	APT.pm			\
	Subscription.pm		\
	VZDump.pm		\
	Backup.pm		\
	Cluster.pm		\
	HAConfig.pm		\
	Nodes.pm		\
	Pool.pm			\
	Tasks.pm		\
	Network.pm		\
	Services.pm

all:

.PHONY: clean
clean:
	rm -rf *~

.PHONY: install 
install: ${PERLSOURCE}
	install -d ${PERLLIBDIR}/PVE/API2
	install -m 0644 ${PERLSOURCE} ${PERLLIBDIR}/PVE/API2
