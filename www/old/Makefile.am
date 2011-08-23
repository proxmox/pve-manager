include $(top_builddir)/common.mk

JSSRC= 				                 	\
	../ext/extjs/examples/ux/MultiSelect.js	 	\
	../ext/extjs/examples/ux/BufferView.js 		\
	../ext/extjs/examples/ux/fileuploadfield/FileUploadField.js \
	PVEUtils.js 					\
	util/base64.js					\
	data/ObjectReader.js				\
	data/ObjectStore.js				\
	data/UpdateStore.js				\
	data/SearchStore.js				\
	grid/ObjectView.js				\
	PVECache.js 					\
	StatusPanel.js 					\
	Workspace.js 					\
	window/ModalDialog.js				\
	window/LoginWindow.js				\
	form/StdForm.js					\
	form/ModifyDirStorage.js			\
	PVEFilter.js 					\
	ResourceTree.js 				\
	ConfigPanel.js					\
	PVEConsole.js					\
	KVMConfig.js					\
	NodeConfig.js 					\
	StorageBrowser.js				\
	ClusterConfig.js 				\
	PVESearch.js

pvemanagerlib.js: ${JSSRC}
	cat ${JSSRC} >$@

pvelib_DATA = pvemanagerlib.js
pvelibdir = ${WWW_EXTDIR}

privatedir = ${WWW_BASEDIR}
private_SCRIPTS = 		\
	startup.pl

managerdir = ${WWW_ROOTDIR}
manager_SCRIPTS = 		\
	index.pl

install-data-hook: 
	chown -R www-data:www-data ${DESTDIR}/${privatedir}
	chown -R www-data:www-data ${DESTDIR}/${managerdir}
	chown -R www-data:www-data ${DESTDIR}/${pvelibdir}

clean-local:
	-rm -rf *~ store/*~ pvemanagerlib.js


