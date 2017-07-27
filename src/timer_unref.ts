const timer = setTimeout(() => {
    console.log('after 1000 ms');

    const timer2 = setTimeout(() => {
        console.log('after 2000 ms');
    }, 1000);
    timer2.unref();
}, 1000);