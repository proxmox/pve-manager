include ../../defines.mk

SUBDIRS=Hardware Ceph Cluster

PERLSOURCE = 			\
	ACME.pm			\
	ACMEAccount.pm		\
	ACMEPlugin.pm		\
	APT.pm			\
	Backup.pm		\
	BackupInfo.pm		\
	Ceph.pm			\
	Certificates.pm		\
	Cluster.pm		\
	HAConfig.pm		\
	Hardware.pm		\
	Network.pm		\
	NodeConfig.pm		\
	Nodes.pm		\
	Pool.pm			\
	Replication.pm		\
	ReplicationConfig.pm	\
	Services.pm		\
	Subscription.pm		\
	Tasks.pm		\
	VZDump.pm		\

all:

.PHONY: clean
clean:
	rm -rf *~
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done

.PHONY: install 
install: ${PERLSOURCE}
	install -d ${PERLLIBDIR}/PVE/API2
	install -m 0644 ${PERLSOURCE} ${PERLLIBDIR}/PVE/API2
	set -e && for i in ${SUBDIRS}; do ${MAKE} -C $$i $@; done
