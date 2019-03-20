Ext.define('PVE.ceph.CephInstallWizard', {
	extend: 'PVE.window.Wizard',
	alias: 'widget.pveCephInstallWizard',
	mixins: ['Proxmox.Mixin.CBind'],
	resizable: false,
	nodename: undefined,
	viewModel: {
	    data: {
		nodename: ''
	    }
	},
	cbindData: {
	    nodename: undefined
	},
	title: gettext('Installation'),
	items: [
	    {
		title: gettext('Info'),
		xtype: 'panel',
		border: false,
		bodyBorder: false,
		onlineHelp: 'chapter_pveceph',
		html: '<h3>Ceph?</h3>'+
		'<blockquote cite="https://ceph.com/"><p>"<b>Ceph</b> is a unified, distributed storage system designed for excellent performance, reliability and scalability."</p></blockquote>'+
		'<p><b>Ceph</b> is currently <b>not installed</b> on this node, click on the next button below to start the installation.'+
		' This wizard will guide you through the necessary steps, after the initial installation you will be offered to create a initial configuration.'+
		' The configuration step is only needed once per cluster and will be skipped if a config is already present.</p>'+
		'<p>Please take a look at our documentation, by clicking the help button below, before starting the installation, if you want to gain deeper knowledge about Ceph visit <a href="http://docs.ceph.com/docs/master/">ceph.com</a>.</p>',
		listeners: {
		    activate: function() {
			// notify owning container that it should display a help button
			if (this.onlineHelp) {
			    Ext.GlobalEvents.fireEvent('proxmoxShowHelp', this.onlineHelp);
			}
			this.up('pveCephInstallWizard').down('#back').hide(true);
			this.up('pveCephInstallWizard').down('#next').setText(gettext('Start installation'));
		    },
		    deactivate: function() {
			if (this.onlineHelp) {
			    Ext.GlobalEvents.fireEvent('proxmoxHideHelp', this.onlineHelp);
			}
			this.up('pveCephInstallWizard').down('#next').setText(gettext('Next'));
		    }
		}
	    },
	    {
		title: gettext('Installation'),
		xtype: 'panel',
		layout: 'fit',
		cbind:{
		    nodename: '{nodename}'
		},
		listeners: {
		    afterrender: function() {
			var me = this;
			me.down('pveNoVncConsole').fireEvent('activate');
		    },
		    activate: function() {
			var me = this;
			var nodename = me.nodename;
			me.updateStore = Ext.create('Proxmox.data.UpdateStore', {
				storeid: 'ceph-status-' + nodename,
				interval: 1000,
				proxy: {
				    type: 'proxmox',
				    url: '/api2/json/nodes/' + nodename + '/ceph/status'
				},
				listeners: {
				    load: function(rec, response, success, operation) {
					var wizard = me.up('#wizcontent');
					var tabs = wizard.items;
					var lastTab = tabs.items[tabs.length-1];
					if (success) {
					    me.updateStore.stopUpdate();
					    lastTab.enable();
					    wizard.setActiveTab(lastTab);
					} else if (operation.error.statusText.match("not initialized", "i")) {
					    me.updateStore.stopUpdate();
					    me.down('textfield').setValue('success');
					} else if (operation.error.statusText.match("rados_connect failed", "i")) {
					    me.updateStore.stopUpdate();
					    lastTab.enable();
					    wizard.setActiveTab(lastTab);
					} else if (!operation.error.statusText.match("not installed", "i")) {
					    Proxmox.Utils.setErrorMask(me, operation.error.statusText);
					}
				    }
				}
			});
			me.updateStore.startUpdate();
		    },
		    destroy: function() {
			var me = this;
			if (me.updateStore) {
			    me.updateStore.stopUpdate();
			}
		    }
		},
		items: [
		    {
			itemId: 'jsconsole',
			consoleType: 'cmd',
			xtermjs: true,
			xtype: 'pveNoVncConsole',
			cbind:{
			    nodename: '{nodename}'
			},
			cmd: 'ceph_install'
		    },
		    {
			xtype: 'textfield',
			name: 'installSuccess',
			value: '',
			allowBlank: false,
			submitValue: false,
			hidden: true
		    }
		]
	    },
	    {
		xtype: 'inputpanel',
		title: gettext('Configuration'),
		onlineHelp: 'chapter_pveceph',
		cbind: {
		    nodename: '{nodename}'
		},
		listeners: {
		    activate: function() {
			this.up('pveCephInstallWizard').down('#submit').setText(gettext('Next'));
		    },
		    deactivate: function() {
			this.up('pveCephInstallWizard').down('#submit').setText(gettext('Finish'));
		    }
		},
		column1: [
		    {
			xtype: 'displayfield',
			name: 'nodename',
			fieldLabel: gettext('Node'),
			cbind: {
			    value: '{nodename}'
			},
			padding: 5
		    },
		    {
			xtype: 'textfield',
			name: 'network',
			vtype: 'IPCIDRAddress',
			value: '',
			fieldLabel: 'Public Network IP/CIDR',
			allowBlank: false
		    },
		    {
			xtype: 'textfield',
			name: 'cluster-network',
			vtype: 'IPCIDRAddress',
			fieldLabel: 'Cluster Network IP/CIDR',
			allowBlank: true,
			emptyText: gettext('Same as Public Network')
		    }
		],
		advancedColumn1: [
		    {
			xtype: 'numberfield',
			name: 'size',
			fieldLabel: 'Number of replicas',
			value: '',
			maxValue: 7,
			minValue: 1,
			allowBlank: true,
			emptyText: '3'
		    },
		    {
			xtype: 'numberfield',
			name: 'min_size',
			fieldLabel: 'Minimum replicas',
			value: '',
			maxValue: 7,
			minValue: 1,
			allowBlank: true,
			emptyText: '2'
		    },
		    {
			xtype: 'numberfield',
			name: 'pg_bits',
			fieldLabel: 'Placement group bits',
			value: '',
			maxValue: 14,
			minValue: 6,
			allowBlank: true,
			emptyText: '6'
		    }
		],
		onGetValues: function(values) {
		    ['cluster-network', 'size', 'min_size', 'pg_bits'].forEach(function(field) {
			if (!values[field]) {
			    delete values[field];
			}
		    });
		    return values;
		},
		onSubmit: function() {
		    var me = this;
		    var wizard = me.up('window');
		    var kv = wizard.getValues();
		    delete kv['delete'];
		    var nodename = me.nodename;
		    delete kv.nodename;
		    Proxmox.Utils.API2Request({
			url: '/nodes/'+nodename+'/ceph/init',
			waitMsgTarget: wizard,
			method: 'POST',
			params: kv,
			success: function() {
			    var tp = me.up('#wizcontent');
			    var atab = tp.getActiveTab();

			    var next = tp.items.indexOf(atab) + 1;
			    var ntab = tp.items.getAt(next);
			    if (ntab) {
				ntab.enable();
				tp.setActiveTab(ntab);
			    }
			},
			failure: function(response, opts) {
			    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			}
		    });
		}
	    },
	    {
		title: gettext('Success'),
		xtype: 'panel',
		border: false,
		bodyBorder: false,
		onlineHelp: 'pve_ceph_install',
		html: '<h3>Installation successful!</h3>'+
		'<p>The basic installation and configuration is completed, depending on your setup some of the following steps are required to start using Ceph:</p>'+
		'<ol><li>Creating Ceph Monitors</li><li>Creating Ceph OSDs</li><li>Creating Ceph Pools</li></ol>'+
		'<p>To learn more click on the help button below.</p>',
		listeners: {
		    activate: function() {
			// notify owning container that it should display a help button
			if (this.onlineHelp) {
			    Ext.GlobalEvents.fireEvent('proxmoxShowHelp', this.onlineHelp);
			}

			var tp = this.up('#wizcontent');
			var idx = tp.items.indexOf(this)-1;
			for(;idx >= 0;idx--) {
			    var nc = tp.items.getAt(idx);
			    if (nc) {
				nc.disable();
			    }
			}
		    },
		    deactivate: function() {
			if (this.onlineHelp) {
			    Ext.GlobalEvents.fireEvent('proxmoxHideHelp', this.onlineHelp);
			}
		    }
		},
		onSubmit: function() {
		    var wizard = this.up('pveCephInstallWizard');
		    wizard.close();
		}
	    }
	]
    });
