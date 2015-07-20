<script type="text/javascript">
  function applyTableStyle()
  {
    var tables = document.getElementsByTagName('table');
    for (i = 0; i < tables.length; i++) {
      tables[i].className = 'table table-bordered';
      if (cg = tables[i].getElementsByTagName('colgroup')[0])
        cg.innerHTML = '';
    }
  }

  function changeTagType(theClassName)
  {
    var e = document.getElementsByClassName(theClassName)[0];
    var d = document.createElement('h5');
    d.innerHTML = e.innerHTML;
    e.parentNode.replaceChild(d, e);
  }

  applyTableStyle();
  changeTagType('author');
  changeTagType('date');
</script>
