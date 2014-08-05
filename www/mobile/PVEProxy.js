Ext.define('PVE.RestProxy', {
    extend: 'Ext.data.RestProxy',
    alias : 'proxy.pve',

    constructor: function(config) {
	var me = this;

	config = config || {};

	Ext.applyIf(config, {
	    pageParam : null,
	    startParam: null,
	    limitParam: null,
	    groupParam: null,
	    sortParam: null,
	    filterParam: null,
	    noCache : false,
	    reader: {
		type: 'json',
		rootProperty: config.root || 'data'
	    },
	    afterRequest: function(request, success) {
		me.fireEvent('afterload', me, request, success);
		return;
	    }
	});

	me.callParent([config]); 
    }
});

Ext.define('pve-domains', {
    extend: "Ext.data.Model",

    config: {
	fields: [ 'realm', 'type', 'comment', 'default', 'tfa',
		  { 
		      name: 'descr',
		      // Note: We use this in the RealmComboBox.js
		      // (see Bug #125)
		      convert: function(value, record) {
			  var info = record.data;
			  var text;

			  if (value) {
			      return value;
			  }
			  // return realm if there is no comment
			  text = info.comment || info.realm;

			  if (info.tfa) {
			      text += " (+ " + info.tfa + ")";
			  }

			  return text;
		      }
		  }
		],
	proxy: {
	    type: 'pve',
	    url: "/api2/json/access/domains"
	}
    }
});

Ext.define('pve-tasks', {
    extend: 'Ext.data.Model',
    config: {
	fields:  [ 
	    { name: 'starttime', type : 'date', dateFormat: 'timestamp' }, 
	    { name: 'endtime', type : 'date', dateFormat: 'timestamp' }, 
	    { name: 'pid', type: 'int' },
	    'node', 'upid', 'user', 'status', 'type', 'id'
	],
	idProperty: 'upid'
    }
});
